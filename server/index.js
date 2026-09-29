import express from 'express';
import { db, nextId } from './database.js';

const app = express();
const port = Number(process.env.API_PORT || 4000);
app.use(express.json({ limit: '10mb' }));

const resources = {
  projects: { table: 'projects', prefix: 'PROJ', fields: ['name','description','product','manager','qa_lead','status','environment','start_date','target_release_date','app_url','jira_url','created_by'], required: ['name'] },
  users: { table: 'users', prefix: 'USR', fields: ['name','email','role','project_id'], required: ['name','role'] },
  plans: { table: 'test_plans', prefix: 'PLAN', fields: ['name','project_id','description','scope','objectives','strategy','environment','build','start_date','end_date','lead','status','priority','created_by'], required: ['name','project_id'] },
  milestones: { table: 'plan_milestones', prefix: 'MILE', fields: ['plan_id','name','start_date','end_date','owner','status'], required: ['plan_id','name'] },
  requirements: { table: 'requirements', prefix: 'REQ', fields: ['project_id','name','description','feature','priority','source','status','acceptance_criteria','created_by'], required: ['project_id','name'] },
  suites: { table: 'test_suites', prefix: 'SUITE', fields: ['name','project_id','plan_id','parent_id','description','owner','created_by'], required: ['name','project_id'] },
  cases: { table: 'test_cases', prefix: 'TC', fields: ['title','project_id','plan_id','suite_id','requirement_id','module','feature','test_type','priority','severity','preconditions','test_data','automation_status','automation_reference','assigned_to','status','version','tags','created_by'], required: ['title','project_id'] },
  runs: { table: 'test_runs', prefix: 'RUN', fields: ['name','project_id','plan_id','suite_id','build','environment','browser','device','start_date','end_date','assigned_to','status','created_by'], required: ['name','project_id'] },
  views: { table: 'custom_views', prefix: 'VIEW', fields: ['name','project_id','filters','created_by'], required: ['name','project_id'] },
  defects: { table: 'defects', prefix: 'BUG', fields: ['title','project_id','case_id','run_id','execution_id','requirement_id','failed_step_id','description','environment','build','severity','priority','status','assigned_developer','reporter','steps_to_reproduce','expected_result','actual_result','resolution','external_issue_url','jira_key'], required: ['title','project_id','severity','status'] },
};

function audit(entityType, entityId, action, fields = {}) {
  db.prepare('INSERT INTO audit_logs (entity_type,entity_id,action,changed_fields) VALUES (?,?,?,?)')
    .run(entityType, entityId, action, JSON.stringify(fields));
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/bootstrap', (_req, res) => {
  const all = (table) => {
    try { return db.prepare(`SELECT * FROM ${table}`).all(); } catch (_) { return []; }
  };
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
    executions, custom_views: all('custom_views'), defects: all('defects'), audit: all('audit_logs'),
  });
});

app.post('/api/runs', (req, res, next) => {
  try {
    const body = req.body;
    const def = resources.runs;
    const missing = def.required.find((field) => !body[field]);
    if (missing) return res.status(400).json({ error: `${missing} is required.` });
    const ids = Array.isArray(body.case_ids) ? [...new Set(body.case_ids)].filter(Boolean) : [];
    let selected = [];
    if (ids.length) {
      selected = ids.map((id) => db.prepare('SELECT * FROM test_cases WHERE id=? AND project_id=?').get(id, body.project_id)).filter(Boolean);
    } else if (Array.isArray(body.suite_ids) && body.suite_ids.length) {
      const placeholders = body.suite_ids.map(() => '?').join(',');
      selected = db.prepare(`SELECT * FROM test_cases WHERE suite_id IN (${placeholders}) AND project_id=? ORDER BY id`).all(...body.suite_ids, body.project_id);
    } else if (body.suite_id) {
      selected = db.prepare('SELECT * FROM test_cases WHERE suite_id=? AND project_id=? ORDER BY id').all(body.suite_id, body.project_id);
    } else if (body.plan_id) {
      selected = db.prepare('SELECT * FROM test_cases WHERE (plan_id=? OR suite_id IN (SELECT id FROM test_suites WHERE plan_id=?)) AND project_id=? ORDER BY id').all(body.plan_id, body.plan_id, body.project_id);
    } else if (body.all_project_cases) {
      selected = db.prepare('SELECT * FROM test_cases WHERE project_id=? ORDER BY id').all(body.project_id);
    }
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
    const { status, actual_result, comment, tester, jira_ticket } = req.body;
    const fields = { status, actual_result, comment, tester, jira_ticket, executed_at: status && status !== 'Not Run' ? new Date().toISOString() : existing.executed_at };
    const updates = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (updates.length) db.prepare(`UPDATE test_executions SET ${updates.map(([key]) => `${key}=?`).join(',')} WHERE id=?`).run(...updates.map(([, value]) => value), existing.id);
    audit('execution', existing.id, 'updated', Object.fromEntries(updates));
    res.json({ id: existing.id });
  } catch (error) { next(error); }
});

app.post('/api/cases/:id/duplicate', (req, res, next) => {
  try {
    const original = db.prepare('SELECT * FROM test_cases WHERE id=?').get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Case not found' });
    const id = nextId('TC', 'test_cases');
    const title = req.body.title || `${original.title} (Copy)`;
    const suiteId = req.body.suite_id !== undefined ? req.body.suite_id : original.suite_id;
    const planId = req.body.plan_id !== undefined ? req.body.plan_id : original.plan_id;
    const tags = req.body.tags !== undefined ? req.body.tags : original.tags;
    const createdBy = req.body.created_by || original.created_by || 'QA Admin';
    db.transaction(() => {
      db.prepare(`INSERT INTO test_cases (id,title,project_id,plan_id,suite_id,requirement_id,module,feature,test_type,priority,severity,preconditions,test_data,automation_status,automation_reference,assigned_to,status,version,tags,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, title, original.project_id, planId, suiteId, original.requirement_id, original.module, original.feature, original.test_type, original.priority, original.severity, original.preconditions, original.test_data, original.automation_status, original.automation_reference, original.assigned_to, 'Draft', '1.0', tags, createdBy);
      const steps = db.prepare('SELECT * FROM test_case_steps WHERE case_id=? ORDER BY step_number').all(original.id);
      const addStep = db.prepare('INSERT INTO test_case_steps (id,case_id,step_number,action,test_data,expected_result) VALUES (?,?,?,?,?,?)');
      steps.forEach((st, idx) => addStep.run(`${id}-S${String(idx + 1).padStart(2, '0')}`, id, idx + 1, st.action, st.test_data || '', st.expected_result));
      audit('case', id, 'duplicated_from', { from: original.id });
    })();
    res.status(201).json({ id });
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

const handlePatchResource = (req, res, next) => {
  try {
    const def = resources[req.params.resource];
    if (!def) return res.status(404).json({ error: 'Unknown resource.' });
    const fields = def.fields.filter((field) => req.body[field] !== undefined);
    const steps = Array.isArray(req.body.steps) ? req.body.steps : null;
    if (!fields.length && !steps) return res.status(400).json({ error: 'No editable fields supplied.' });
    
    const updateRecord = db.transaction(() => {
      if (fields.length) {
        db.prepare(`UPDATE ${def.table} SET ${fields.map((field) => `${field}=?`).join(',')} WHERE id=?`)
          .run(...fields.map((field) => req.body[field]), req.params.id);
      }
      if (req.params.resource === 'cases' && steps) {
        db.prepare('DELETE FROM test_case_steps WHERE case_id=?').run(req.params.id);
        const addStep = db.prepare('INSERT INTO test_case_steps (id,case_id,step_number,action,test_data,expected_result) VALUES (?,?,?,?,?,?)');
        steps.forEach((step, index) => {
          addStep.run(`${req.params.id}-S${String(index + 1).padStart(2, '0')}`, req.params.id, index + 1, step.action, step.test_data || '', step.expected_result);
        });
      }
      if (req.params.resource === 'cases' && req.body.requirement_id) {
        db.prepare('INSERT OR IGNORE INTO requirement_test_cases VALUES (?,?)').run(req.body.requirement_id, req.params.id);
      }
      audit(req.params.resource, req.params.id, 'updated', Object.fromEntries(fields.map((field) => [field, req.body[field]])));
    });
    updateRecord();
    res.json({ id: req.params.id });
  } catch (error) { next(error); }
};

app.patch('/api/:resource/:id', handlePatchResource);
app.patch('/:resource/:id', handlePatchResource);

const handleDeleteResource = (req, res, next) => {
  try {
    const { resource, id } = req.params;
    const def = resources[resource];
    if (!def) return res.status(404).json({ error: 'Unknown resource.' });

    db.pragma('foreign_keys = OFF');
    try {
      const deleteTx = db.transaction(() => {
        if (resource === 'projects') {
          db.prepare('DELETE FROM defects WHERE project_id=?').run(id);
          const runs = db.prepare('SELECT id FROM test_runs WHERE project_id=?').all(id);
          for (const run of runs) {
            const execs = db.prepare('SELECT id FROM test_executions WHERE run_id=?').all(run.id);
            for (const e of execs) db.prepare('DELETE FROM test_execution_steps WHERE execution_id=?').run(e.id);
            db.prepare('DELETE FROM test_executions WHERE run_id=?').run(run.id);
            db.prepare('DELETE FROM test_run_cases WHERE run_id=?').run(run.id);
          }
          db.prepare('DELETE FROM test_runs WHERE project_id=?').run(id);
          const cases = db.prepare('SELECT id FROM test_cases WHERE project_id=?').all(id);
          for (const c of cases) {
            db.prepare('DELETE FROM test_case_steps WHERE case_id=?').run(c.id);
            db.prepare('DELETE FROM test_case_versions WHERE case_id=?').run(c.id);
            db.prepare('DELETE FROM requirement_test_cases WHERE case_id=?').run(c.id);
          }
          db.prepare('DELETE FROM test_cases WHERE project_id=?').run(id);
          db.prepare('DELETE FROM test_suites WHERE project_id=?').run(id);
          const plans = db.prepare('SELECT id FROM test_plans WHERE project_id=?').all(id);
          for (const p of plans) db.prepare('DELETE FROM plan_milestones WHERE plan_id=?').run(p.id);
          db.prepare('DELETE FROM test_plans WHERE project_id=?').run(id);
          db.prepare('DELETE FROM requirements WHERE project_id=?').run(id);
          try { db.prepare('DELETE FROM custom_views WHERE project_id=?').run(id); } catch (_) {}
          db.prepare('UPDATE users SET project_id=NULL WHERE project_id=?').run(id);
          db.prepare('DELETE FROM projects WHERE id=?').run(id);
        } else if (resource === 'plans') {
          db.prepare('DELETE FROM plan_milestones WHERE plan_id=?').run(id);
          db.prepare('UPDATE test_suites SET plan_id=NULL WHERE plan_id=?').run(id);
          db.prepare('UPDATE test_cases SET plan_id=NULL WHERE plan_id=?').run(id);
          db.prepare('UPDATE test_runs SET plan_id=NULL WHERE plan_id=?').run(id);
          db.prepare('DELETE FROM test_plans WHERE id=?').run(id);
        } else if (resource === 'suites') {
          db.prepare('UPDATE test_suites SET parent_id=NULL WHERE parent_id=?').run(id);
          db.prepare('UPDATE test_runs SET suite_id=NULL WHERE suite_id=?').run(id);
          const cases = db.prepare('SELECT id FROM test_cases WHERE suite_id=?').all(id);
          for (const c of cases) {
            db.prepare('DELETE FROM test_case_steps WHERE case_id=?').run(c.id);
            db.prepare('DELETE FROM test_case_versions WHERE case_id=?').run(c.id);
            db.prepare('DELETE FROM requirement_test_cases WHERE case_id=?').run(c.id);
            const execs = db.prepare('SELECT id FROM test_executions WHERE case_id=?').all(c.id);
            for (const e of execs) db.prepare('DELETE FROM test_execution_steps WHERE execution_id=?').run(e.id);
            db.prepare('DELETE FROM test_executions WHERE case_id=?').run(c.id);
            db.prepare('DELETE FROM test_run_cases WHERE case_id=?').run(c.id);
            db.prepare('DELETE FROM test_cases WHERE id=?').run(c.id);
          }
          db.prepare('DELETE FROM test_suites WHERE id=?').run(id);
        } else if (resource === 'cases') {
          db.prepare('DELETE FROM test_case_steps WHERE case_id=?').run(id);
          db.prepare('DELETE FROM test_case_versions WHERE case_id=?').run(id);
          db.prepare('DELETE FROM requirement_test_cases WHERE case_id=?').run(id);
          db.prepare('UPDATE defects SET case_id=NULL WHERE case_id=?').run(id);
          const execs = db.prepare('SELECT id FROM test_executions WHERE case_id=?').all(id);
          for (const e of execs) db.prepare('DELETE FROM test_execution_steps WHERE execution_id=?').run(e.id);
          db.prepare('DELETE FROM test_executions WHERE case_id=?').run(id);
          db.prepare('DELETE FROM test_run_cases WHERE case_id=?').run(id);
          db.prepare('DELETE FROM test_cases WHERE id=?').run(id);
        } else if (resource === 'runs') {
          const execs = db.prepare('SELECT id FROM test_executions WHERE run_id=?').all(id);
          for (const e of execs) db.prepare('DELETE FROM test_execution_steps WHERE execution_id=?').run(e.id);
          db.prepare('DELETE FROM test_executions WHERE run_id=?').run(id);
          db.prepare('DELETE FROM test_run_cases WHERE run_id=?').run(id);
          db.prepare('UPDATE defects SET run_id=NULL, execution_id=NULL WHERE run_id=?').run(id);
          db.prepare('DELETE FROM test_runs WHERE id=?').run(id);
        } else if (resource === 'requirements') {
          db.prepare('DELETE FROM requirement_test_cases WHERE requirement_id=?').run(id);
          db.prepare('UPDATE test_cases SET requirement_id=NULL WHERE requirement_id=?').run(id);
          db.prepare('UPDATE defects SET requirement_id=NULL WHERE requirement_id=?').run(id);
          db.prepare('DELETE FROM requirements WHERE id=?').run(id);
        } else if (resource === 'views') {
          db.prepare('DELETE FROM custom_views WHERE id=?').run(id);
        } else if (resource === 'users') {
          db.prepare('DELETE FROM users WHERE id=?').run(id);
        } else {
          db.prepare(`DELETE FROM ${def.table} WHERE id=?`).run(id);
        }
        audit(resource, id, 'deleted');
      });
      deleteTx();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    res.json({ success: true, id });
  } catch (error) { next(error); }
};

app.delete('/api/:resource/:id', handleDeleteResource);
app.delete('/:resource/:id', handleDeleteResource);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || 'Request failed.' });
});

app.listen(port, '0.0.0.0', () => console.log(`QA API listening on http://localhost:${port}`));
