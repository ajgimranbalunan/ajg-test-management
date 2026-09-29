import express from 'express';
import { db, nextId } from './database.js';

const app = express();
const port = Number(process.env.API_PORT || 4000);
app.use(express.json({ limit: '10mb' }));

const resources = {
  projects: { table: 'projects', prefix: 'PROJ', fields: ['name','description','product','manager','qa_lead','status','environment','start_date','target_release_date','app_url','jira_url'], required: ['name'] },
  users: { table: 'users', prefix: 'USR', fields: ['name','email','role','project_id'], required: ['name','role'] },
  plans: { table: 'test_plans', prefix: 'PLAN', fields: ['name','project_id','description','scope','objectives','strategy','environment','build','start_date','end_date','lead','status','priority'], required: ['name','project_id'] },
  milestones: { table: 'plan_milestones', prefix: 'MILE', fields: ['plan_id','name','start_date','end_date','owner','status'], required: ['plan_id','name'] },
  requirements: { table: 'requirements', prefix: 'REQ', fields: ['project_id','name','description','feature','priority','source','status','acceptance_criteria'], required: ['project_id','name'] },
  suites: { table: 'test_suites', prefix: 'SUITE', fields: ['name','project_id','plan_id','parent_id','description','owner'], required: ['name','project_id'] },
  cases: { table: 'test_cases', prefix: 'TC', fields: ['title','project_id','plan_id','suite_id','requirement_id','module','feature','test_type','priority','severity','preconditions','test_data','automation_status','automation_reference','assigned_to','status','version','tags'], required: ['title','project_id','suite_id'] },
  runs: { table: 'test_runs', prefix: 'RUN', fields: ['name','project_id','plan_id','suite_id','build','environment','browser','device','start_date','end_date','assigned_to','status'], required: ['name','project_id'] },
  defects: { table: 'defects', prefix: 'BUG', fields: ['title','project_id','case_id','run_id','execution_id','requirement_id','failed_step_id','description','environment','build','severity','priority','status','assigned_developer','reporter','steps_to_reproduce','expected_result','actual_result','resolution','external_issue_url','jira_key'], required: ['title','project_id','severity','status'] },
};

function audit(entityType, entityId, action, fields = {}) {
  db.prepare('INSERT INTO audit_logs (entity_type,entity_id,action,changed_fields) VALUES (?,?,?,?)')
    .run(entityType, entityId, action, JSON.stringify(fields));
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/bootstrap', (_req, res) => {
  const all = (table) => db.prepare(`SELECT * FROM ${table}`).all();
  const executions = db.prepare(`SELECT e.*, r.name AS run_name, r.environment, r.build,
    rc.snapshot AS case_snapshot, rc.steps_snapshot
    FROM test_executions e JOIN test_runs r ON r.id=e.run_id
    JOIN test_run_cases rc ON rc.run_id=e.run_id AND rc.case_id=e.case_id ORDER BY e.id`).all()
    .map((row) => {
      const stepsSnapshot = JSON.parse(row.steps_snapshot);
      return { ...row, case_snapshot: JSON.parse(row.case_snapshot), steps_snapshot: stepsSnapshot,
        steps: db.prepare('SELECT * FROM test_execution_steps WHERE execution_id=? ORDER BY step_number').all(row.id)
          .map((step) => ({ ...step, step_snapshot: stepsSnapshot.find((snapshot) => snapshot.step_number === step.step_number) })) };
    });
  res.json({
    projects: all('projects'), users: all('users'), plans: all('test_plans'), milestones: all('plan_milestones'),
    requirements: all('requirements'), suites: all('test_suites'), cases: all('test_cases'),
    steps: all('test_case_steps'), runs: all('test_runs'), run_cases: all('test_run_cases'),
    executions, defects: all('defects'), audit: all('audit_logs'),
  });
});

app.post('/api/runs', (req, res, next) => {
  try {
    const body = req.body;
    const def = resources.runs;
    const missing = def.required.find((field) => !body[field]);
    if (missing) return res.status(400).json({ error: `${missing} is required.` });
    const ids = Array.isArray(body.case_ids) ? [...new Set(body.case_ids)] : [];
    const selected = ids.length
      ? ids.map((id) => db.prepare('SELECT * FROM test_cases WHERE id=? AND project_id=?').get(id, body.project_id)).filter(Boolean)
      : body.suite_id
        ? db.prepare('SELECT * FROM test_cases WHERE suite_id=? AND project_id=? ORDER BY id').all(body.suite_id, body.project_id)
        : body.plan_id
          ? db.prepare('SELECT * FROM test_cases WHERE plan_id=? AND project_id=? ORDER BY id').all(body.plan_id, body.project_id)
          : [];
    if (!selected.length) return res.status(400).json({ error: 'Select at least one test case or a suite/plan containing cases.' });
    const fields = def.fields.filter((field) => body[field] !== undefined);
    const id = nextId(def.prefix, def.table);
    const insertRun = db.prepare(`INSERT INTO test_runs (id,${fields.join(',')}) VALUES (?,${fields.map(() => '?').join(',')})`);
    const addRunCase = db.prepare('INSERT INTO test_run_cases VALUES (?,?,?,?,?)');
    const addExecution = db.prepare('INSERT INTO test_executions (id,run_id,case_id,status,tester) VALUES (?,?,?,?,?)');
    const addExecStep = db.prepare('INSERT INTO test_execution_steps (id,execution_id,step_id,step_number,status) VALUES (?,?,?,?,?)');
    const createRun = db.transaction(() => {
      insertRun.run(id, ...fields.map((field) => body[field]));
      selected.forEach((testCase, index) => {
        const steps = db.prepare('SELECT * FROM test_case_steps WHERE case_id=? ORDER BY step_number').all(testCase.id);
        addRunCase.run(`RC-${id.slice(-3)}-${String(index + 1).padStart(3, '0')}`, id, testCase.id, JSON.stringify(testCase), JSON.stringify(steps));
        const executionId = nextId('EXEC', 'test_executions');
        addExecution.run(executionId, id, testCase.id, 'Not Run', body.assigned_to || '');
        steps.forEach((step) => addExecStep.run(`${executionId}-${step.step_number}`, executionId, step.id, step.step_number, 'Not Run'));
      });
      audit('run', id, 'created', { case_count: selected.length });
    });
    createRun();
    res.status(201).json({ id, case_count: selected.length });
  } catch (error) { next(error); }
});

app.post('/api/cases', (req, res, next) => {
  try {
    const body = req.body;
    const def = resources.cases;
    const missing = def.required.find((field) => !body[field]);
    if (missing) return res.status(400).json({ error: `${missing} is required.` });
    const steps = Array.isArray(body.steps) ? body.steps : [];
    if (!steps.length || steps.some((step) => !step.action || !step.expected_result)) {
      return res.status(400).json({ error: 'Each test step needs an action and expected result.' });
    }
    const id = nextId(def.prefix, def.table);
    const fields = def.fields.filter((field) => body[field] !== undefined);
    const createCase = db.transaction(() => {
      db.prepare(`INSERT INTO test_cases (id,${fields.join(',')}) VALUES (?,${fields.map(() => '?').join(',')})`).run(id, ...fields.map((field) => body[field]));
      const addStep = db.prepare('INSERT INTO test_case_steps (id,case_id,step_number,action,test_data,expected_result) VALUES (?,?,?,?,?,?)');
      steps.forEach((step, index) => addStep.run(`${id}-S${String(index + 1).padStart(2, '0')}`, id, index + 1, step.action, step.test_data || '', step.expected_result));
      if (body.requirement_id) db.prepare('INSERT OR IGNORE INTO requirement_test_cases VALUES (?,?)').run(body.requirement_id, id);
      const record = db.prepare('SELECT * FROM test_cases WHERE id=?').get(id);
      db.prepare('INSERT INTO test_case_versions (id,case_id,version,changed_by,change_description,snapshot) VALUES (?,?,?,?,?,?)')
        .run(`${id}-V1`, id, record.version || '1.0', 'QA Admin', 'Initial version', JSON.stringify(record));
      audit('case', id, 'created', { title: record.title, step_count: steps.length });
    });
    createCase();
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

app.post('/api/:resource', (req, res, next) => {
  try {
    const def = resources[req.params.resource];
    if (!def) return res.status(404).json({ error: 'Unknown resource.' });
    const body = req.body;
    const missing = def.required.find((field) => !body[field]);
    if (missing) return res.status(400).json({ error: `${missing} is required.` });
    const fields = def.fields.filter((field) => body[field] !== undefined);
    const id = nextId(def.prefix, def.table);
    db.prepare(`INSERT INTO ${def.table} (id${fields.length ? `,${fields.join(',')}` : ''}) VALUES (?${fields.map(() => ',?').join('')})`)
      .run(id, ...fields.map((field) => body[field]));
    audit(req.params.resource, id, 'created', body);
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

app.patch('/api/executions/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM test_executions WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Execution not found.' });
    const { status, actual_result, comment, tester } = req.body;
    const fields = { status, actual_result, comment, tester, executed_at: status && status !== 'Not Run' ? new Date().toISOString() : existing.executed_at };
    const updates = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (updates.length) db.prepare(`UPDATE test_executions SET ${updates.map(([key]) => `${key}=?`).join(',')} WHERE id=?`).run(...updates.map(([, value]) => value), existing.id);
    audit('execution', existing.id, 'updated', Object.fromEntries(updates));
    res.json({ id: existing.id });
  } catch (error) { next(error); }
});

app.patch('/api/execution-steps/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM test_execution_steps WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Execution step not found.' });
    const { status, actual_result, comment, evidence } = req.body;
    const fields = { status, actual_result, comment, evidence };
    const updates = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (updates.length) db.prepare(`UPDATE test_execution_steps SET ${updates.map(([key]) => `${key}=?`).join(',')} WHERE id=?`).run(...updates.map(([, value]) => value), existing.id);
    const allSteps = db.prepare('SELECT status FROM test_execution_steps WHERE execution_id=?').all(existing.execution_id);
    const statuses = allSteps.map((step) => step.status);
    const overall = statuses.includes('Failed') ? 'Failed'
      : statuses.includes('Blocked') ? 'Blocked'
        : statuses.every((result) => ['Passed', 'N/A'].includes(result)) ? 'Passed'
          : statuses.every((result) => result === 'Not Run') ? 'Not Run' : 'In Progress';
    db.prepare('UPDATE test_executions SET status=?,executed_at=? WHERE id=?').run(overall, overall === 'Not Run' ? '' : new Date().toISOString(), existing.execution_id);
    const runId = db.prepare('SELECT run_id FROM test_executions WHERE id=?').get(existing.execution_id).run_id;
    const runResults = db.prepare('SELECT status FROM test_executions WHERE run_id=?').all(runId).map((item) => item.status);
    const runComplete = runResults.length > 0 && runResults.every((result) => ['Passed', 'Failed', 'Blocked', 'Skipped'].includes(result));
    const run = db.prepare('SELECT status FROM test_runs WHERE id=?').get(runId);
    if (run.status !== 'Cancelled') {
      db.prepare('UPDATE test_runs SET status=?,end_date=? WHERE id=?')
        .run(runComplete ? 'Completed' : 'In Progress', runComplete ? new Date().toISOString().slice(0, 10) : '', runId);
    }
    audit('execution_step', existing.id, 'updated', Object.fromEntries(updates));
    res.json({ execution_id: existing.execution_id, status: overall });
  } catch (error) { next(error); }
});

app.patch('/:resource/:id', (req, res, next) => {
  try {
    const def = resources[req.params.resource];
    if (!def) return res.status(404).json({ error: 'Unknown resource.' });
    const fields = def.fields.filter((field) => req.body[field] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'No editable fields supplied.' });
    const result = db.prepare(`UPDATE ${def.table} SET ${fields.map((field) => `${field}=?`).join(',')} WHERE id=?`).run(...fields.map((field) => req.body[field]), req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Record not found.' });
    audit(req.params.resource, req.params.id, 'updated', Object.fromEntries(fields.map((field) => [field, req.body[field]])));
    res.json({ id: req.params.id });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || 'Request failed.' });
});

app.listen(port, '0.0.0.0', () => console.log(`QA API listening on http://localhost:${port}`));
