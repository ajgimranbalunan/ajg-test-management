import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'qa-management.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', product TEXT DEFAULT '',
    manager TEXT DEFAULT '', qa_lead TEXT DEFAULT '', status TEXT DEFAULT 'Active', environment TEXT DEFAULT 'QA',
    start_date TEXT DEFAULT '', target_release_date TEXT DEFAULT '', app_url TEXT DEFAULT '', jira_url TEXT DEFAULT '',
    created_by TEXT DEFAULT 'QA Admin'
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT DEFAULT '', role TEXT NOT NULL, project_id TEXT REFERENCES projects(id)
  );
  CREATE TABLE IF NOT EXISTS test_plans (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), description TEXT DEFAULT '',
    scope TEXT DEFAULT '', objectives TEXT DEFAULT '', strategy TEXT DEFAULT '', environment TEXT DEFAULT 'QA', build TEXT DEFAULT '',
    start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', lead TEXT DEFAULT '', status TEXT DEFAULT 'Draft', priority TEXT DEFAULT 'Medium',
    created_by TEXT DEFAULT 'QA Admin'
  );
  CREATE TABLE IF NOT EXISTS plan_milestones (
    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES test_plans(id) ON DELETE CASCADE, name TEXT NOT NULL,
    start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', owner TEXT DEFAULT '', status TEXT DEFAULT 'Planned'
  );
  CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, description TEXT DEFAULT '',
    feature TEXT DEFAULT '', priority TEXT DEFAULT 'Medium', source TEXT DEFAULT '', status TEXT DEFAULT 'Proposed', acceptance_criteria TEXT DEFAULT '',
    created_by TEXT DEFAULT 'QA Admin'
  );
  CREATE TABLE IF NOT EXISTS test_suites (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), plan_id TEXT REFERENCES test_plans(id),
    parent_id TEXT REFERENCES test_suites(id), description TEXT DEFAULT '', owner TEXT DEFAULT '',
    created_by TEXT DEFAULT 'QA Admin'
  );
  CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), plan_id TEXT REFERENCES test_plans(id),
    suite_id TEXT REFERENCES test_suites(id), requirement_id TEXT REFERENCES requirements(id), module TEXT DEFAULT '', feature TEXT DEFAULT '',
    test_type TEXT DEFAULT 'Functional', priority TEXT DEFAULT 'Medium', severity TEXT DEFAULT 'Medium', preconditions TEXT DEFAULT '',
    test_data TEXT DEFAULT '', automation_status TEXT DEFAULT 'Manual', automation_reference TEXT DEFAULT '', assigned_to TEXT DEFAULT '',
    status TEXT DEFAULT 'Draft', version TEXT DEFAULT '1.0', tags TEXT DEFAULT '', created_by TEXT DEFAULT 'QA Admin', updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS test_case_steps (
    id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE, step_number INTEGER NOT NULL,
    action TEXT NOT NULL, test_data TEXT DEFAULT '', expected_result TEXT NOT NULL, evidence TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS test_case_versions (
    id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE, version TEXT NOT NULL,
    changed_by TEXT DEFAULT '', change_description TEXT DEFAULT '', snapshot TEXT NOT NULL, changed_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS requirement_test_cases (
    requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE, PRIMARY KEY (requirement_id, case_id)
  );
  CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), plan_id TEXT REFERENCES test_plans(id),
    suite_id TEXT REFERENCES test_suites(id), build TEXT DEFAULT '', environment TEXT DEFAULT 'QA', browser TEXT DEFAULT '',
    device TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', assigned_to TEXT DEFAULT '', status TEXT DEFAULT 'Not Started',
    created_by TEXT DEFAULT 'QA Admin'
  );
  CREATE TABLE IF NOT EXISTS test_run_cases (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL REFERENCES test_cases(id), snapshot TEXT NOT NULL, steps_snapshot TEXT NOT NULL,
    UNIQUE (run_id, case_id)
  );
  CREATE TABLE IF NOT EXISTS test_executions (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL REFERENCES test_cases(id), status TEXT DEFAULT 'Not Run', tester TEXT DEFAULT '',
    actual_result TEXT DEFAULT '', comment TEXT DEFAULT '', jira_ticket TEXT DEFAULT '', executed_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS test_execution_steps (
    id TEXT PRIMARY KEY, execution_id TEXT NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    step_id TEXT NOT NULL, step_number INTEGER NOT NULL, status TEXT DEFAULT 'Not Run', actual_result TEXT DEFAULT '',
    comment TEXT DEFAULT '', evidence TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS custom_views (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
    filters TEXT DEFAULT '{}', created_by TEXT DEFAULT 'QA Admin', created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS defects (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), case_id TEXT REFERENCES test_cases(id),
    run_id TEXT REFERENCES test_runs(id), execution_id TEXT REFERENCES test_executions(id), requirement_id TEXT REFERENCES requirements(id),
    failed_step_id TEXT DEFAULT '', description TEXT DEFAULT '', environment TEXT DEFAULT 'QA', build TEXT DEFAULT '',
    severity TEXT NOT NULL DEFAULT 'Medium', priority TEXT DEFAULT 'Medium', status TEXT NOT NULL DEFAULT 'New',
    assigned_developer TEXT DEFAULT '', reporter TEXT DEFAULT '', steps_to_reproduce TEXT DEFAULT '', expected_result TEXT DEFAULT '',
    actual_result TEXT DEFAULT '', resolution TEXT DEFAULT '', external_issue_url TEXT DEFAULT '', jira_key TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
    changed_by TEXT DEFAULT 'QA Admin', changed_fields TEXT DEFAULT '{}', changed_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_cases_project ON test_cases(project_id);
  CREATE INDEX IF NOT EXISTS idx_runs_project ON test_runs(project_id);
  CREATE INDEX IF NOT EXISTS idx_defects_project_status ON defects(project_id, status);
`);

// Run alter table migrations for existing databases
const addColumn = (table, column, def) => {
  try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`).run(); } catch (_) {}
};
addColumn('projects', 'created_by', "TEXT DEFAULT 'QA Admin'");
addColumn('test_plans', 'created_by', "TEXT DEFAULT 'QA Admin'");
addColumn('requirements', 'created_by', "TEXT DEFAULT 'QA Admin'");
addColumn('test_suites', 'created_by', "TEXT DEFAULT 'QA Admin'");
addColumn('test_cases', 'created_by', "TEXT DEFAULT 'QA Admin'");
addColumn('test_runs', 'created_by', "TEXT DEFAULT 'QA Admin'");
addColumn('test_executions', 'jira_ticket', "TEXT DEFAULT ''");

const count = db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
if (count === 0) seed();

function seed() {
  const insert = (sql, rows) => {
    const statement = db.prepare(sql);
    const insertMany = db.transaction((items) => items.forEach((item) => statement.run(...item)));
    insertMany(rows);
  };
  const projects = [
    ['PROJ-001', 'Client Portal', 'Policyholder self-service and account management.', 'Customer Experience', 'Morgan Lee', 'Taylor Reed', 'Active', 'QA', '2026-08-01', '2026-10-30', 'https://portal.example.test', 'https://jira.example.com/projects/PORTAL'],
    ['PROJ-002', 'Claims Hub', 'Claims intake, review, and payment workflows.', 'Claims Operations', 'Jordan Kim', 'Casey Morgan', 'Active', 'Staging', '2026-07-15', '2026-11-20', 'https://claims.example.test', 'https://jira.example.com/projects/CLAIM'],
  ];
  insert('INSERT INTO projects (id,name,description,product,manager,qa_lead,status,environment,start_date,target_release_date,app_url,jira_url,created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', projects.map((project) => [...project, 'QA Admin']));
  insert('INSERT INTO users VALUES (?, ?, ?, ?, ?)', [
    ['USR-001', 'Taylor Reed', 'taylor@example.com', 'Test Lead', 'PROJ-001'],
    ['USR-002', 'Alex Chen', 'alex@example.com', 'QA Engineer', 'PROJ-001'],
    ['USR-003', 'Sam Rivera', 'sam@example.com', 'Developer', 'PROJ-001'],
    ['USR-004', 'Morgan Lee', 'morgan@example.com', 'Viewer / Manager', 'PROJ-001'],
    ['USR-005', 'Casey Morgan', 'casey@example.com', 'QA Administrator', 'PROJ-002'],
  ]);
  insert('INSERT INTO test_plans (id,name,project_id,description,scope,objectives,strategy,environment,build,start_date,end_date,lead,status,priority,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    ['PLAN-001', 'Sprint 24 Regression', 'PROJ-001', 'Validate account and policy workflows for Sprint 24.', 'Login, profile, policy search', 'Protect core customer journeys', 'Risk-based regression', 'QA', '24.3.0-rc2', '2026-09-22', '2026-10-05', 'Taylor Reed', 'In Progress', 'High', 'Taylor Reed'],
    ['PLAN-002', 'Portal Release 5.2', 'PROJ-001', 'Release readiness and browser compatibility.', 'Release-critical portal journeys', 'Confirm release acceptance', 'Functional and compatibility', 'Staging', '5.2.0', '2026-10-06', '2026-10-20', 'Taylor Reed', 'Planned', 'Critical', 'Taylor Reed'],
    ['PLAN-003', 'Claims Intake Acceptance', 'PROJ-002', 'Validate new claim intake and document upload.', 'FNOL and attachment workflows', 'Meet claims acceptance criteria', 'UAT with operations', 'Staging', '2.8.1', '2026-09-25', '2026-10-18', 'Casey Morgan', 'In Progress', 'High', 'Casey Morgan'],
  ]);
  insert('INSERT INTO plan_milestones VALUES (?, ?, ?, ?, ?, ?, ?)', [
    ['MILE-001', 'PLAN-001', 'Regression testing', '2026-09-25', '2026-10-02', 'QA Team', 'In Progress'],
    ['MILE-002', 'PLAN-001', 'Release sign-off', '2026-10-03', '2026-10-05', 'Taylor Reed', 'Planned'],
    ['MILE-003', 'PLAN-003', 'Operations UAT', '2026-10-06', '2026-10-14', 'Claims QA', 'Planned'],
  ]);
  insert('INSERT INTO requirements (id,project_id,name,description,feature,priority,source,status,acceptance_criteria,created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    ['REQ-001', 'PROJ-001', 'Secure customer sign-in', 'Customers can authenticate with valid credentials and recover access.', 'Identity', 'Critical', 'Product', 'Approved', 'Valid credentials open the account; invalid credentials show a safe error.', 'Taylor Reed'],
    ['REQ-002', 'PROJ-001', 'Profile maintenance', 'Customers can update their contact details.', 'Account', 'High', 'Product', 'Approved', 'Saved changes persist and are visible on reload.', 'Taylor Reed'],
    ['REQ-003', 'PROJ-001', 'Policy search', 'Customers can find active policies by policy number.', 'Policies', 'High', 'Product', 'Approved', 'Exact policy number returns the correct policy.', 'Taylor Reed'],
    ['REQ-004', 'PROJ-002', 'Claim submission', 'A customer can submit a first notice of loss.', 'Claims', 'Critical', 'Operations', 'Approved', 'Required fields validate and a claim reference is returned.', 'Casey Morgan'],
    ['REQ-005', 'PROJ-002', 'Evidence upload', 'A claim can include supporting documents.', 'Claims', 'Medium', 'Operations', 'Proposed', 'Supported files upload and remain available to the reviewer.', 'Casey Morgan'],
  ]);
  insert('INSERT INTO test_suites (id,name,project_id,plan_id,parent_id,description,owner,created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    ['SUITE-001', 'Authentication', 'PROJ-001', 'PLAN-001', null, 'Sign-in, recovery, and session behavior.', 'Alex Chen', 'Alex Chen'],
    ['SUITE-002', 'Account & Profile', 'PROJ-001', 'PLAN-001', null, 'Customer account and profile scenarios.', 'Alex Chen', 'Alex Chen'],
    ['SUITE-003', 'Policy Search', 'PROJ-001', 'PLAN-001', null, 'Policy discovery and search filters.', 'Taylor Reed', 'Taylor Reed'],
    ['SUITE-004', 'Claims Intake', 'PROJ-002', 'PLAN-003', null, 'Claim submission scenarios.', 'Casey Morgan', 'Casey Morgan'],
    ['SUITE-005', 'Document Evidence', 'PROJ-002', 'PLAN-003', null, 'Claim attachment validation.', 'Casey Morgan', 'Casey Morgan'],
  ]);
  const titles = [
    ['Sign in with valid credentials', 'PROJ-001', 'PLAN-001', 'SUITE-001', 'REQ-001', 'Authentication', 'Functional', 'High', 'Alex Chen', '@smoke @login'],
    ['Reject an incorrect password', 'PROJ-001', 'PLAN-001', 'SUITE-001', 'REQ-001', 'Authentication', 'Security', 'Critical', 'Alex Chen', '@security @login'],
    ['Recover a locked account', 'PROJ-001', 'PLAN-001', 'SUITE-001', 'REQ-001', 'Authentication', 'Functional', 'Medium', 'Alex Chen', '@login'],
    ['Expire an inactive session', 'PROJ-001', 'PLAN-001', 'SUITE-001', 'REQ-001', 'Authentication', 'Regression', 'Medium', 'Taylor Reed', '@regression'],
    ['Update contact details', 'PROJ-001', 'PLAN-001', 'SUITE-002', 'REQ-002', 'Account', 'Functional', 'High', 'Alex Chen', '@profile'],
    ['Validate profile email format', 'PROJ-001', 'PLAN-001', 'SUITE-002', 'REQ-002', 'Account', 'Functional', 'Medium', 'Alex Chen', '@validation'],
    ['Cancel profile edits', 'PROJ-001', 'PLAN-001', 'SUITE-002', 'REQ-002', 'Account', 'Regression', 'Low', 'Taylor Reed', '@regression'],
    ['Find an active policy by number', 'PROJ-001', 'PLAN-001', 'SUITE-003', 'REQ-003', 'Policies', 'Smoke', 'High', 'Taylor Reed', '@smoke @search'],
    ['Show an empty state for no matches', 'PROJ-001', 'PLAN-001', 'SUITE-003', 'REQ-003', 'Policies', 'UI', 'Low', 'Alex Chen', '@ui'],
    ['Filter policies by effective date', 'PROJ-001', 'PLAN-001', 'SUITE-003', 'REQ-003', 'Policies', 'Functional', 'Medium', 'Taylor Reed', '@search'],
    ['Submit a complete first notice of loss', 'PROJ-002', 'PLAN-003', 'SUITE-004', 'REQ-004', 'Claims', 'Functional', 'Critical', 'Casey Morgan', '@critical @claims'],
    ['Validate required claim fields', 'PROJ-002', 'PLAN-003', 'SUITE-004', 'REQ-004', 'Claims', 'Regression', 'High', 'Casey Morgan', '@claims'],
    ['Save a claim as a draft', 'PROJ-002', 'PLAN-003', 'SUITE-004', 'REQ-004', 'Claims', 'Functional', 'Medium', 'Casey Morgan', '@claims'],
    ['Upload a supported PDF document', 'PROJ-002', 'PLAN-003', 'SUITE-005', 'REQ-005', 'Documents', 'Integration', 'High', 'Casey Morgan', '@upload'],
    ['Reject an oversized attachment', 'PROJ-002', 'PLAN-003', 'SUITE-005', 'REQ-005', 'Documents', 'Security', 'Medium', 'Casey Morgan', '@upload'],
  ];
  const caseInsert = db.prepare('INSERT INTO test_cases (id,title,project_id,plan_id,suite_id,requirement_id,module,test_type,priority,severity,preconditions,test_data,automation_status,assigned_to,status,version,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const stepInsert = db.prepare('INSERT INTO test_case_steps (id,case_id,step_number,action,test_data,expected_result) VALUES (?,?,?,?,?,?)');
  const linkInsert = db.prepare('INSERT INTO requirement_test_cases VALUES (?, ?)');
  const makeCases = db.transaction(() => titles.forEach((item, index) => {
    const id = `TC-${String(index + 1).padStart(3, '0')}`;
    const [title, project, plan, suite, requirement, module, type, priority, assigned, tags] = item;
    caseInsert.run(id, title, project, plan, suite, requirement, module, module, type, priority, 'User is signed in to the QA test environment.', 'Seeded valid and invalid test data.', index % 4 === 0 ? 'Automated' : 'Manual', assigned, 'Approved', '1.0', tags);
    stepInsert.run(`ST-${String(index + 1).padStart(3, '0')}-1`, id, 1, `Open the ${module.toLowerCase()} workflow.`, '', 'The workflow is displayed without errors.');
    stepInsert.run(`ST-${String(index + 1).padStart(3, '0')}-2`, id, 2, `Enter the required ${module.toLowerCase()} test data.`, 'Use the scenario data above.', 'Inputs are accepted and validated.');
    stepInsert.run(`ST-${String(index + 1).padStart(3, '0')}-3`, id, 3, 'Submit and inspect the outcome.', '', 'The expected workflow outcome is displayed and saved.');
    linkInsert.run(requirement, id);
  }));
  makeCases();
  insert('INSERT INTO test_runs (id,name,project_id,plan_id,suite_id,build,environment,browser,device,start_date,end_date,assigned_to,status,created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    ['RUN-001', 'Regression Testing - Sprint 24', 'PROJ-001', 'PLAN-001', 'SUITE-001', '24.3.0-rc2', 'QA', 'Chrome', 'Desktop', '2026-09-28', '', 'Alex Chen', 'In Progress', 'Alex Chen'],
    ['RUN-002', 'Profile & Policy Smoke', 'PROJ-001', 'PLAN-001', 'SUITE-002', '24.3.0-rc2', 'QA', 'Edge', 'Desktop', '2026-09-27', '2026-09-28', 'Taylor Reed', 'Completed', 'Taylor Reed'],
    ['RUN-003', 'Claims Intake UAT', 'PROJ-002', 'PLAN-003', 'SUITE-004', '2.8.1', 'Staging', 'Chrome', 'Tablet', '2026-09-29', '', 'Casey Morgan', 'In Progress', 'Casey Morgan'],
  ]);
  const selected = [
    ['RUN-001', ['TC-001', 'TC-002', 'TC-003', 'TC-004']],
    ['RUN-002', ['TC-005', 'TC-006', 'TC-007', 'TC-008']],
    ['RUN-003', ['TC-011', 'TC-012', 'TC-013', 'TC-014']],
  ];
  const runCaseInsert = db.prepare('INSERT INTO test_run_cases VALUES (?, ?, ?, ?, ?)');
  const executionInsert = db.prepare('INSERT INTO test_executions (id,run_id,case_id,status,tester,actual_result,comment,executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const executionStepInsert = db.prepare('INSERT INTO test_execution_steps VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const makeRuns = db.transaction(() => selected.forEach(([runId, caseIds], runIndex) => caseIds.forEach((caseId, caseIndex) => {
    const testCase = db.prepare('SELECT * FROM test_cases WHERE id=?').get(caseId);
    const steps = db.prepare('SELECT * FROM test_case_steps WHERE case_id=? ORDER BY step_number').all(caseId);
    const execId = `EXEC-${String(runIndex * 4 + caseIndex + 1).padStart(3, '0')}`;
    runCaseInsert.run(`RC-${String(runIndex * 4 + caseIndex + 1).padStart(3, '0')}`, runId, caseId, JSON.stringify(testCase), JSON.stringify(steps));
    const resultsByRun = [
      ['Passed', 'Passed', 'Failed', 'Not Run'],
      ['Failed', 'Passed', 'Passed', 'Failed'],
      ['Failed', 'Passed', 'Not Run', 'Failed'],
    ];
    const result = resultsByRun[runIndex][caseIndex];
    executionInsert.run(execId, runId, caseId, result, runIndex === 2 ? 'Casey Morgan' : 'Alex Chen', result === 'Failed' ? 'Submitting the form returned a validation error.' : '', result === 'Failed' ? 'Observed an unexpected validation response.' : '', result === 'Not Run' ? '' : '2026-09-29T09:00:00.000Z');
    steps.forEach((step, stepIndex) => {
      const stepResult = result === 'Not Run' ? 'Not Run' : result === 'Failed' && stepIndex === 2 ? 'Failed' : 'Passed';
      executionStepInsert.run(`EXS-${String(runIndex * 12 + caseIndex * 3 + stepIndex + 1).padStart(3, '0')}`, execId, step.id, step.step_number, stepResult, stepResult === 'Failed' ? 'Form submission returned an error.' : '', '', '');
    });
  })));
  makeRuns();
  insert('INSERT INTO defects (id,title,project_id,case_id,run_id,execution_id,requirement_id,severity,priority,status,assigned_developer,reporter,environment,build,description,expected_result,actual_result,external_issue_url,jira_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    ['BUG-001', 'Login accepts expired reset token', 'PROJ-001', 'TC-003', 'RUN-001', 'EXEC-003', 'REQ-001', 'High', 'High', 'Open', 'Sam Rivera', 'Alex Chen', 'QA', '24.3.0-rc2', 'Expired recovery token is still accepted.', 'Expired token is rejected.', 'Account recovery continues.', 'https://jira.example.com/browse/PORTAL-123', 'PORTAL-123'],
    ['BUG-002', 'Profile save drops secondary phone', 'PROJ-001', 'TC-005', 'RUN-002', 'EXEC-005', 'REQ-002', 'Medium', 'Medium', 'In Progress', 'Sam Rivera', 'Taylor Reed', 'QA', '24.3.0-rc2', 'Secondary phone is not persisted after reload.', 'All valid contact details persist.', 'Secondary phone field is blank.', '', ''],
    ['BUG-003', 'Policy search fails on lowercase input', 'PROJ-001', 'TC-008', 'RUN-002', 'EXEC-008', 'REQ-003', 'Low', 'Medium', 'Retest', 'Sam Rivera', 'Alex Chen', 'QA', '24.3.0-rc2', 'Search should be case insensitive.', 'Matching policy is returned.', 'No results returned.', '', ''],
    ['BUG-004', 'Claim submission blocks valid postcode', 'PROJ-002', 'TC-011', 'RUN-003', 'EXEC-009', 'REQ-004', 'Critical', 'Critical', 'New', 'Claims Dev Team', 'Casey Morgan', 'Staging', '2.8.1', 'Valid regional postcode fails validation.', 'Claim is created and reference displayed.', 'Address validation reports an invalid postcode.', 'https://jira.example.com/browse/CLAIM-88', 'CLAIM-88'],
    ['BUG-005', 'PDF preview is blank after upload', 'PROJ-002', 'TC-014', 'RUN-003', 'EXEC-012', 'REQ-005', 'High', 'High', 'Open', 'Claims Dev Team', 'Casey Morgan', 'Staging', '2.8.1', 'Uploaded PDF preview does not render.', 'Preview displays the uploaded document.', 'Preview panel is blank.', '', ''],
  ]);
}

export function nextId(prefix, table) {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE id LIKE ?`).all(`${prefix}-%`);
  const max = rows.reduce((value, row) => Math.max(value, Number(row.id.split('-').at(-1)) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}
