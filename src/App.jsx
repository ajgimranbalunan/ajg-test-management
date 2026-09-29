import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Bug, Check, ChevronDown, CircleCheck, CircleHelp, ClipboardList,
  Clock3, Download, ExternalLink, FileText, FolderKanban, Layers, LayoutDashboard,
  ListChecks, Menu, Play, Plus, Search, Settings, Users, X,
} from 'lucide-react';

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Test Plans', icon: ClipboardList },
  { label: 'Test Suites', icon: Layers },
  { label: 'Test Cases', icon: FileText },
  { label: 'Test Runs', icon: Play },
  { label: 'Test Execution', icon: ListChecks },
  { label: 'Defects / Issues', icon: Bug },
  { label: 'Requirements', icon: CircleCheck },
  { label: 'Reports & Analytics', icon: BarChart3 },
  { label: 'Team', icon: Users },
  { label: 'Settings', icon: Settings },
];

const emptyData = { projects: [], users: [], plans: [], milestones: [], requirements: [], suites: [], cases: [], steps: [], runs: [], run_cases: [], executions: [], defects: [], audit: [] };
const statuses = ['Passed', 'Failed', 'Blocked', 'Skipped', 'Not Run'];
const roleOptions = ['QA Administrator', 'Test Lead', 'QA Engineer', 'Developer', 'Viewer / Manager'];

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

const toLabel = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const pick = (items, id) => items.find((item) => item.id === id);
const percentage = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 100) : 0;
const statusClass = (value = 'Not Run') => value.toLowerCase().replaceAll(' ', '-').replaceAll('/', '-');

function App() {
  const [data, setData] = useState(emptyData);
  const [active, setActive] = useState('Dashboard');
  const [projectId, setProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [role, setRole] = useState('QA Administrator');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const result = await request('/bootstrap');
      setData(result);
      setProjectId((current) => current || result.projects[0]?.id || '');
      setError('');
      return result;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const project = pick(data.projects, projectId);
  const inProject = (items) => items.filter((item) => item.project_id === projectId);
  const projectCases = inProject(data.cases);
  const projectRuns = inProject(data.runs);
  const projectDefects = inProject(data.defects);
  const projectPlans = inProject(data.plans);
  const projectRequirements = inProject(data.requirements);
  const projectExecutions = data.executions.filter((item) => pick(data.runs, item.run_id)?.project_id === projectId);
  const metrics = useMemo(() => {
    const executed = projectExecutions.filter((item) => !['Not Run', 'Skipped'].includes(item.status));
    const passed = projectExecutions.filter((item) => item.status === 'Passed').length;
    const failed = projectExecutions.filter((item) => item.status === 'Failed').length;
    const linkedRequirements = projectRequirements.filter((requirement) => projectCases.some((testCase) => testCase.requirement_id === requirement.id)).length;
    const automated = projectCases.filter((item) => item.automation_status === 'Automated').length;
    const openDefects = projectDefects.filter((item) => !['Closed', 'Rejected'].includes(item.status));
    return {
      passed, failed,
      blocked: projectExecutions.filter((item) => item.status === 'Blocked').length,
      skipped: projectExecutions.filter((item) => item.status === 'Skipped').length,
      notRun: projectExecutions.filter((item) => item.status === 'Not Run').length,
      passRate: percentage(passed, executed.length),
      coverage: percentage(linkedRequirements, projectRequirements.length),
      automation: percentage(automated, projectCases.length),
      openDefects: openDefects.length,
      critical: openDefects.filter((item) => item.severity === 'Critical').length,
      executed: executed.length,
    };
  }, [projectCases, projectDefects, projectExecutions, projectRequirements]);

  const announce = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };
  const save = async (path, body) => {
    try {
      await request(path, { method: 'POST', body: JSON.stringify(body) });
      await refresh();
      setModal(null);
      announce('Saved successfully');
    } catch (saveError) { announce(saveError.message); }
  };
  const filtered = (items, searchable) => items.filter((item) => {
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || searchable(item).some((value) => String(value ?? '').toLowerCase().includes(term));
    const itemStatus = item.status || 'Not Run';
    const matchesStatus = statusFilter === 'All statuses' || itemStatus === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const exportCsv = (name, rows) => {
    if (!rows.length) return announce('Nothing to export');
    const columns = Object.keys(rows[0]);
    const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => `"${String(row[column] ?? '').replaceAll('"', '""')}"`).join(','))].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const openCreate = (kind, extra = {}) => setModal({ kind, ...extra });
  const pageAddKind = {
    Projects: 'project', 'Test Plans': 'plan', 'Test Suites': 'suite', 'Test Cases': 'case',
    'Test Runs': 'run', 'Defects / Issues': 'defect', Requirements: 'requirement', Team: 'user',
  }[active];
  const canEdit = role === 'QA Administrator'
    || (role === 'Test Lead' && ['Test Plans', 'Test Suites', 'Test Cases', 'Test Runs', 'Defects / Issues', 'Requirements'].includes(active))
    || (role === 'QA Engineer' && active === 'Defects / Issues');
  const activeTitle = active === 'Defects / Issues' ? 'Defects' : active;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">Q</div><div><strong>QUALITY</strong><span>ASSURANCE</span></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${active === label ? 'selected' : ''}`} onClick={() => { setActive(label); setStatusFilter('All statuses'); }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Defects / Issues' && metrics.openDefects > 0 && <b className="nav-count">{metrics.openDefects}</b>}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="help-mark"><CircleHelp size={16} /><span>Workspace help</span></div><div className="profile-chip"><div className="avatar">{(data.users.find((person) => person.role === role)?.name || 'QA').split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div className="profile-copy"><strong>{data.users.find((person) => person.role === role)?.name || 'QA Admin'}</strong><span>{role}</span></div><ChevronDown size={15} /></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeTitle}</strong></div><div className="topbar-actions"><label className="project-switcher"><span>PROJECT</span><select aria-label="Select project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label><div className="top-divider" /><label className="role-switcher"><span>VIEW AS</span><select aria-label="Choose role preview" value={role} onChange={(event) => setRole(event.target.value)}>{roleOptions.map((item) => <option key={item}>{item}</option>)}</select></label><button className="top-avatar" title={data.users.find((person) => person.role === role)?.name || 'QA Admin'}>{(data.users.find((person) => person.role === role)?.name || 'QA').split(' ').map((part) => part[0]).slice(0, 2).join('')}</button></div></header>

        <section className="page-wrap">
          {error && <div className="notice error-notice">API connection: {error}. Start the local app with <code>npm run dev</code>.</div>}
          {loading ? <div className="loading-panel">Loading QA workspace…</div> : <>
            {active === 'Dashboard' && <Dashboard project={project} plans={projectPlans} cases={projectCases} runs={projectRuns} executions={projectExecutions} defects={projectDefects} requirements={projectRequirements} metrics={metrics} onNavigate={setActive} />}
            {active === 'Test Execution' && <ExecutionPage runs={projectRuns} executions={projectExecutions} refresh={refresh} canCreateDefect={['QA Administrator', 'Test Lead', 'QA Engineer'].includes(role)} openDefect={(execution, step) => openCreate('defect', { execution, failedStep: step })} announce={announce} />}
            {active === 'Reports & Analytics' && <Reports project={project} cases={projectCases} runs={projectRuns} executions={projectExecutions} defects={projectDefects} requirements={projectRequirements} metrics={metrics} exportCsv={exportCsv} />}
            {active === 'Settings' && <SettingsPage role={role} />}
            {active !== 'Dashboard' && active !== 'Test Execution' && active !== 'Reports & Analytics' && active !== 'Settings' && <EntityPage
              active={active} project={project} data={data} items={pageItems(active, { projectId, data, projectCases, projectRuns, projectPlans, projectRequirements, projectDefects })}
              query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              onCreate={() => openCreate(pageAddKind)} onExport={exportCsv} canEdit={canEdit} role={role}
              onUpdate={async (resource, id, body) => { try { await request(`/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }); await refresh(); announce('Status updated'); } catch (updateError) { announce(updateError.message); } }} />}
          </>}
        </section>
      </main>
      {modal && <CreateDialog modal={modal} data={data} projectId={projectId} save={save} close={() => setModal(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function pageItems(active, context) {
  const { projectId, data } = context;
  const inProject = (items) => items.filter((item) => item.project_id === projectId);
  if (active === 'Projects') return data.projects;
  if (active === 'Test Plans') return inProject(data.plans);
  if (active === 'Test Suites') return inProject(data.suites).map((suite) => ({ ...suite, case_count: data.cases.filter((item) => item.suite_id === suite.id).length, plan_name: pick(data.plans, suite.plan_id)?.name }));
  if (active === 'Test Cases') return context.projectCases.map((testCase) => ({ ...testCase, suite_name: pick(data.suites, testCase.suite_id)?.name, requirement_name: pick(data.requirements, testCase.requirement_id)?.name }));
  if (active === 'Test Runs') return context.projectRuns.map((run) => ({ ...run, plan_name: pick(data.plans, run.plan_id)?.name, results: data.executions.filter((item) => item.run_id === run.id) }));
  if (active === 'Defects / Issues') return context.projectDefects.map((bug) => ({ ...bug, case_title: pick(data.cases, bug.case_id)?.title }));
  if (active === 'Requirements') return context.projectRequirements.map((requirement) => ({ ...requirement, linked_cases: data.cases.filter((item) => item.requirement_id === requirement.id).length, linked_runs: data.executions.filter((execution) => execution.case_snapshot.requirement_id === requirement.id).length }));
  if (active === 'Team') return data.users.filter((user) => user.project_id === projectId || !user.project_id);
  return [];
}

function Dashboard({ project, plans, cases, runs, executions, defects, requirements, metrics, onNavigate }) {
  const resultCount = statuses.map((status) => ({ status, count: executions.filter((item) => item.status === status).length }));
  const activePlan = plans.find((plan) => plan.status === 'In Progress');
  const latestRun = [...runs].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  const planProgress = activePlan ? percentage(executions.filter((item) => item.run_id && runs.find((run) => run.id === item.run_id)?.plan_id === activePlan.id && !['Not Run', 'Skipped'].includes(item.status)).length, cases.filter((item) => item.plan_id === activePlan.id).length) : 0;
  return <>
    <div className="page-heading dashboard-heading"><div><div className="eyebrow">QUALITY OPERATIONS <span className="live-dot" /> LIVE</div><h1>Good morning, team.</h1><p>{project?.name || 'Select a project'} <span className="heading-separator">/</span> QA health and current release readiness</p></div><button className="button button-primary" onClick={() => onNavigate('Test Execution')}><Play size={15} fill="currentColor" /> Open test execution</button></div>
    <div className="dashboard-grid">
      <section className="kpi-grid">
        <Kpi label="Test cases" value={cases.length} detail={`${cases.filter((item) => item.status === 'Approved').length} approved`} icon={FileText} tone="green" />
        <Kpi label="Active plans" value={plans.filter((item) => item.status === 'In Progress').length} detail={`${plans.length} total plans`} icon={ClipboardList} tone="lime" />
        <Kpi label="Executions" value={executions.length} detail={`${metrics.executed} completed`} icon={ListChecks} tone="blue" />
        <Kpi label="Open defects" value={metrics.openDefects} detail={`${metrics.critical} critical`} icon={Bug} tone="coral" />
      </section>
      <section className="panel results-panel"><div className="panel-heading"><div><span className="eyebrow">LATEST EXECUTION</span><h2>Test results</h2></div><button className="text-button" onClick={() => onNavigate('Test Runs')}>All runs <span>↗</span></button></div><div className="result-summary"><div className="donut" style={{ '--passed': percentage(metrics.passed, executions.length) }}><div><strong>{metrics.passRate}%</strong><span>pass rate</span></div></div><div className="result-legend">{resultCount.map(({ status, count }) => <div className="legend-row" key={status}><i className={`legend-dot ${statusClass(status)}`} /><span>{status}</span><strong>{count}</strong></div>)}</div></div></section>
      <section className="panel release-panel"><div className="panel-heading"><div><span className="eyebrow">RELEASE READINESS</span><h2>{activePlan?.name || 'No active plan'}</h2></div><span className={`status-pill ${statusClass(activePlan?.status || 'Planned')}`}>{activePlan?.status || 'Planned'}</span></div><div className="release-progress-label"><span>Execution progress</span><strong>{planProgress}%</strong></div><div className="progress-track"><i style={{ width: `${planProgress}%` }} /></div><div className="release-stats"><div><strong>{cases.filter((item) => item.plan_id === activePlan?.id).length}</strong><span>cases</span></div><div><strong>{executions.filter((item) => runs.find((run) => run.id === item.run_id)?.plan_id === activePlan?.id && item.status === 'Failed').length}</strong><span>failed</span></div><div><strong>{defects.filter((item) => !['Closed', 'Rejected'].includes(item.status)).length}</strong><span>open defects</span></div><div><strong>{metrics.coverage}%</strong><span>coverage</span></div></div><button className="panel-link" onClick={() => onNavigate('Test Plans')}>View plan details <span>→</span></button></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">WORK IN MOTION</span><h2>Recent test runs</h2></div><button className="icon-button" title="View all runs" onClick={() => onNavigate('Test Runs')}><ExternalLink size={15} /></button></div>{runs.slice(0, 4).map((run) => { const runExecutions = executions.filter((item) => item.run_id === run.id); const runPassed = runExecutions.filter((item) => item.status === 'Passed').length; const progress = percentage(runExecutions.filter((item) => !['Not Run', 'Skipped'].includes(item.status)).length, runExecutions.length); return <button key={run.id} className="run-row" onClick={() => onNavigate('Test Execution')}><div className="run-icon"><Play size={14} /></div><div className="run-info"><strong>{run.name}</strong><span>{run.id} <i>·</i> {run.environment} <i>·</i> {run.assigned_to || 'Unassigned'}</span></div><div className="run-progress"><span>{runPassed} passed</span><i><b style={{ width: `${progress}%` }} /></i></div><span className={`status-pill ${statusClass(run.status)}`}>{run.status}</span></button>; })}</section>
      <section className="panel coverage-panel"><div className="panel-heading"><div><span className="eyebrow">TRACEABILITY</span><h2>Requirement coverage</h2></div><button className="text-button" onClick={() => onNavigate('Requirements')}>Matrix <span>↗</span></button></div><div className="coverage-big"><strong>{metrics.coverage}<small>%</small></strong><span>{requirements.filter((item) => cases.some((testCase) => testCase.requirement_id === item.id)).length} of {requirements.length} requirements covered</span></div><div className="coverage-track"><i style={{ width: `${metrics.coverage}%` }} /></div><div className="coverage-note"><span><i className="coverage-key covered" /> Covered</span><span><i className="coverage-key uncovered" /> No linked tests</span></div></section>
    </div>
  </>;
}

function Kpi({ label, value, detail, icon: Icon, tone }) {
  return <div className={`kpi-card tone-${tone}`}><div className="kpi-top"><span>{label}</span><div className="kpi-icon"><Icon size={17} /></div></div><strong className="kpi-number">{value}</strong><span className="kpi-detail">{detail}</span></div>;
}

function EntityPage({ active, project, items, data, query, setQuery, statusFilter, setStatusFilter, onCreate, onExport, canEdit, role, onUpdate }) {
  const searchable = (item) => Object.values(item);
  const rows = filteredEntities(active, items, searchable, query, statusFilter);
  const columns = {
    Projects: ['id','name','product','manager','qa_lead','status'],
    'Test Plans': ['id','name','priority','lead','start_date','end_date','status'],
    'Test Suites': ['id','name','plan_name','case_count','owner'],
    'Test Cases': ['id','title','suite_name','requirement_id','priority','status','automation_status','assigned_to','tags'],
    'Test Runs': ['id','name','plan_name','environment','build','assigned_to','status'],
    'Defects / Issues': ['id','title','case_id','severity','priority','status','assigned_developer','jira_key'],
    Requirements: ['id','name','feature','priority','status','linked_cases','linked_runs'],
    Team: ['name','email','role','project_id'],
  }[active] || [];
  return <>
    <div className="page-heading list-heading"><div><div className="eyebrow">{project?.name || 'ALL PROJECTS'} <span className="heading-separator">/</span> LIBRARY</div><h1>{active === 'Defects / Issues' ? 'Defects & issues' : active}</h1><p>{pageDescription(active)}</p></div>{canEdit && <button className="button button-primary" onClick={onCreate}><Plus size={16} /> {createLabel(active)}</button>}</div>
    <div className="table-toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${active.toLowerCase()}…`} /><kbd>⌘ K</kbd></label><label className="filter-select"><span>STATUS</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{unique(items.map((item) => item.status).filter(Boolean)).map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={14} /></label><span className="table-count">{rows.length} records</span><button className="button button-quiet" onClick={() => onExport(active, rows.map((item) => Object.fromEntries(columns.map((column) => [column, item[column]]))))}><Download size={15} /> Export</button></div>
    <div className="table-panel"><div className="table-scroll"><table><thead><tr><th className="check-column"><input type="checkbox" aria-label="Select all rows" /></th>{columns.map((column) => <th key={column}>{toLabel(column)}</th>)}<th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id || row.name}><td><input type="checkbox" aria-label={`Select ${row.id || row.name}`} /></td>{columns.map((column) => <td key={column}>{active === 'Defects / Issues' && column === 'status' && canUpdateDefect(row, role, data) ? <select className="inline-status" aria-label={`Update ${row.id} status`} value={row.status} onChange={(event) => onUpdate('defects', row.id, { status: event.target.value })}>{['New','Open','In Progress','Fixed','Retest','Reopened','Closed','Rejected'].map((status) => <option key={status}>{status}</option>)}</select> : renderCell(column, row, data)}</td>)}<td><button className="row-more" title="Record actions">···</button></td></tr>)}</tbody></table></div>{rows.length === 0 && <div className="empty-state"><Search size={22} /><strong>No matching records</strong><span>Try changing the search or filters.</span></div>}<div className="table-footer"><span>Showing <strong>{rows.length}</strong> of <strong>{items.length}</strong> records</span><span>{project?.id || ''}</span></div></div>
    {active === 'Requirements' && <div className="traceability-note"><div className="note-icon"><CircleCheck size={17} /></div><div><strong>Traceability at a glance</strong><span>Requirements without linked test cases remain uncovered. Open a requirement's linked tests in the full coverage matrix.</span></div></div>}
  </>;
}

function canUpdateDefect(defect, role, data) {
  if (role === 'QA Administrator' || role === 'Test Lead') return true;
  if (role !== 'Developer') return false;
  return data.users.find((user) => user.role === role)?.name === defect.assigned_developer;
}

function filteredEntities(active, items, searchable, query, statusFilter) {
  return items.filter((item) => {
    const matchesSearch = !query.trim() || searchable(item).some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase()));
    const matchesStatus = statusFilter === 'All statuses' || (item.status || 'Not Run') === statusFilter;
    return matchesSearch && matchesStatus;
  });
}
function unique(values) { return [...new Set(values)]; }
function pageDescription(active) {
  return ({ Projects: 'Products, teams and release environments across your QA portfolio.', 'Test Plans': 'Scope, schedule and track quality against a release objective.', 'Test Suites': 'Reusable, nested collections of related test scenarios.', 'Test Cases': 'The verified source of truth for your manual and automated tests.', 'Test Runs': 'Time-bound execution snapshots for a build and environment.', 'Defects / Issues': 'Triage findings and trace each issue to its failing execution.', Requirements: 'Connect product expectations to tests, runs and outcomes.', Team: 'People and responsibilities in the active project.' })[active] || '';
}
function createLabel(active) { return ({ Projects: 'New project', 'Test Plans': 'New test plan', 'Test Suites': 'New suite', 'Test Cases': 'New test case', 'Test Runs': 'New test run', 'Defects / Issues': 'New defect', Requirements: 'New requirement', Team: 'Add team member' })[active] || 'Create'; }
function renderCell(column, row, data) {
  const value = row[column];
  if (column === 'id') return <span className="record-id">{value}</span>;
  if (column === 'status' || column === 'priority' || column === 'severity' || column === 'automation_status') return <span className={`status-pill ${statusClass(value)}`}>{value}</span>;
  if (column === 'jira_key') return value ? <a className="jira-link" href={row.external_issue_url || '#'} target="_blank" rel="noreferrer">{value} <ExternalLink size={11} /></a> : <span className="muted">—</span>;
  if (column === 'title' || column === 'name') return <strong className="table-primary-text">{value}</strong>;
  if (column === 'requirement_id' && value) return <span className="record-id">{value}</span>;
  if (column === 'suite_name' || column === 'plan_name') return <span>{value || '—'}</span>;
  if (column === 'case_count') return <span className="count-cell">{value} cases</span>;
  if (column === 'linked_cases') return <span className={value ? 'count-cell' : 'coverage-none'}>{value ? `${value} linked` : 'Uncovered'}</span>;
  if (column === 'linked_runs') return <span className="count-cell">{value}</span>;
  if (column === 'results') { const done = value.filter((item) => !['Not Run', 'Skipped'].includes(item.status)).length; return <span className="count-cell">{done}/{value.length} executed</span>; }
  if (column === 'tags') return <span className="tag-list">{String(value || '').split(' ').filter(Boolean).slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</span>;
  if (column === 'project_id') return <span>{pick(data.projects, value)?.name || value}</span>;
  if (column.includes('date')) return <span className="date-cell">{value || '—'}</span>;
  return <span className="table-secondary-text">{value || '—'}</span>;
}

function ExecutionPage({ runs, executions, refresh, canCreateDefect, openDefect, announce }) {
  const [runId, setRunId] = useState(runs[0]?.id || '');
  const [executionId, setExecutionId] = useState('');
  const [drafts, setDrafts] = useState({});
  const selectedRun = pick(runs, runId);
  const runExecutions = executions.filter((item) => item.run_id === runId);
  const selectedExecution = pick(runExecutions, executionId) || runExecutions[0];
  const currentCase = selectedExecution?.case_snapshot;
  const currentSteps = selectedExecution?.steps || [];
  useEffect(() => { if (!runs.some((run) => run.id === runId) && runs[0]) setRunId(runs[0].id); }, [runs, runId]);
  useEffect(() => { if (selectedExecution && executionId !== selectedExecution.id) setExecutionId(selectedExecution.id); }, [selectedExecution, executionId]);
  const completedCount = runExecutions.filter((item) => !['Not Run', 'Skipped'].includes(item.status)).length;
  const runProgress = percentage(completedCount, runExecutions.length);

  const updateStep = async (step, update) => {
    try {
      await request(`/execution-steps/${encodeURIComponent(step.id)}`, { method: 'PATCH', body: JSON.stringify(update) });
      await refresh();
      announce('Step result saved');
    } catch (error) { announce(error.message); }
  };
  const saveStepDraft = (step) => updateStep(step, drafts[step.id] || {});
  const uploadEvidence = async (step, file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return announce('Evidence files must be under 4 MB in this local version.');
    const reader = new FileReader();
    reader.onload = () => updateStep(step, { evidence: JSON.stringify({ name: file.name, type: file.type, data: reader.result }) });
    reader.readAsDataURL(file);
  };

  return <>
    <div className="page-heading execution-heading"><div><div className="eyebrow">QUALITY OPERATIONS <span className="live-dot" /> EXECUTION WORKSPACE</div><h1>Test execution</h1><p>Record outcomes as you work. Results are saved to the run history.</p></div><label className="execution-run-select"><span>TEST RUN</span><select value={runId} onChange={(event) => { setRunId(event.target.value); setExecutionId(''); }} aria-label="Select test run">{runs.map((run) => <option key={run.id} value={run.id}>{run.name}</option>)}</select><ChevronDown size={14} /></label></div>
    {!selectedRun || !runExecutions.length ? <div className="empty-state large-empty"><ListChecks size={24} /><strong>No runnable cases in this project</strong><span>Create a run from a suite or plan containing test cases.</span></div> : <div className="execution-layout">
      <aside className="execution-queue"><div className="queue-top"><div><span className="eyebrow">RUN QUEUE</span><strong>{runExecutions.length} test cases</strong></div><button className="icon-button" title="Refresh" onClick={refresh}><Clock3 size={15} /></button></div><div className="queue-run-info"><span className="record-id">{selectedRun.id}</span><span>{selectedRun.environment} <i>·</i> {selectedRun.build || 'No build'}</span><div className="queue-progress"><div className="progress-track"><i style={{ width: `${runProgress}%` }} /></div><span>{completedCount}/{runExecutions.length} done <b>{runProgress}%</b></span></div></div><div className="queue-list">{runExecutions.map((execution, index) => { const testCase = execution.case_snapshot; return <button key={execution.id} className={`queue-item ${selectedExecution?.id === execution.id ? 'active' : ''}`} onClick={() => setExecutionId(execution.id)}><span className={`queue-result ${statusClass(execution.status)}`}>{execution.status === 'Passed' ? <Check size={13} /> : execution.status === 'Failed' ? <X size={13} /> : <span>{String(index + 1).padStart(2, '0')}</span>}</span><span className="queue-case"><strong>{testCase.id} <i>·</i> {testCase.title}</strong><small>{testCase.priority} priority</small></span><span className={`mini-status ${statusClass(execution.status)}`} /></button>; })}</div></aside>
      <section className="execution-workspace"><div className="execution-case-heading"><div><div className="eyebrow">{selectedRun.name} <span className="heading-separator">/</span> {selectedExecution?.id}</div><h2><span className="record-id">{currentCase?.id}</span> {currentCase?.title}</h2><div className="case-meta"><span className={`status-pill ${statusClass(currentCase?.priority)}`}>{currentCase?.priority} priority</span><span><Users size={13} /> {selectedExecution?.tester || selectedRun.assigned_to || 'Unassigned'}</span><span><Layers size={13} /> {selectedRun.environment}</span><span><Clock3 size={13} /> {currentSteps.length} steps</span></div></div><span className={`status-pill result-pill ${statusClass(selectedExecution?.status)}`}>{selectedExecution?.status}</span></div>
        <div className="steps-heading"><span>TEST STEPS</span><span>Mark each step as you go</span></div>
        <div className="step-list">{currentSteps.map((step) => { const draft = drafts[step.id] || { actual_result: step.actual_result, comment: step.comment }; let evidence = null; try { evidence = step.evidence ? JSON.parse(step.evidence) : null; } catch { evidence = { name: 'Evidence', data: step.evidence }; } return <article className={`step-card ${step.status === 'Failed' ? 'step-failed' : ''}`} key={step.id}><div className="step-topline"><span className="step-number">{String(step.step_number).padStart(2, '0')}</span><div className="step-main"><strong>{step.step_snapshot?.action || currentCase?.title}</strong><div className="expected-line"><span>EXPECTED</span>{step.step_snapshot?.expected_result || 'Complete the step as described.'}</div></div><div className="step-actions">{['Passed','Failed','Blocked','N/A'].map((result) => <button key={result} className={`result-button ${step.status === result ? `chosen ${statusClass(result)}` : ''}`} onClick={() => updateStep(step, { status: result })}>{result === 'Passed' && <Check size={12} />}{result}</button>)}</div></div><div className="step-detail"><label><span>ACTUAL RESULT</span><textarea value={draft.actual_result || ''} placeholder="What happened when you performed this step?" onChange={(event) => setDrafts((current) => ({ ...current, [step.id]: { ...current[step.id], actual_result: event.target.value } }))} /></label><label><span>TESTER COMMENT</span><textarea value={draft.comment || ''} placeholder="Add context for the next person…" onChange={(event) => setDrafts((current) => ({ ...current, [step.id]: { ...current[step.id], comment: event.target.value } }))} /></label><div className="evidence-row"><label className="evidence-upload"><input type="file" accept="image/*,video/*,.txt,.log,.pdf,.doc,.docx" onChange={(event) => uploadEvidence(step, event.target.files?.[0])} /><Plus size={13} /> Attach evidence</label>{evidence && <a className="evidence-file" href={evidence.data} download={evidence.name}><FileText size={13} /> {evidence.name}</a>}<button className="save-step" onClick={() => saveStepDraft(step)}>Save notes</button></div></div></article>; })}</div>
        <div className="execution-footer"><div><span className="eyebrow">OVERALL RESULT</span><strong className={`status-text ${statusClass(selectedExecution?.status)}`}>{selectedExecution?.status}</strong></div><div className="footer-actions"><button className="button button-quiet" onClick={() => { const index = runExecutions.findIndex((item) => item.id === selectedExecution?.id); setExecutionId(runExecutions[Math.max(0, index - 1)]?.id); }}>← Previous</button><button className="button button-quiet" onClick={() => { const index = runExecutions.findIndex((item) => item.id === selectedExecution?.id); setExecutionId(runExecutions[Math.min(runExecutions.length - 1, index + 1)]?.id); }}>Next test →</button>{canCreateDefect && selectedExecution?.status === 'Failed' && <button className="button button-danger" onClick={() => { const failed = currentSteps.find((step) => step.status === 'Failed'); openDefect(selectedExecution, failed); }}><Bug size={15} /> Create defect</button>}</div></div>
      </section>
    </div>}
  </>;
}

function Reports({ project, cases, runs, executions, defects, requirements, metrics, exportCsv }) {
  const counts = statuses.map((status) => ({ status, count: executions.filter((item) => item.status === status).length }));
  const maxCount = Math.max(1, ...counts.map((item) => item.count));
  const severity = ['Critical', 'High', 'Medium', 'Low'].map((value) => ({ value, count: defects.filter((item) => item.severity === value && !['Closed', 'Rejected'].includes(item.status)).length }));
  const uncovered = requirements.filter((requirement) => !cases.some((item) => item.requirement_id === requirement.id));
  return <>
    <div className="page-heading list-heading"><div><div className="eyebrow">{project?.name} <span className="heading-separator">/</span> QUALITY INTELLIGENCE</div><h1>Reports & analytics</h1><p>Execution health, requirement traceability and release risks.</p></div><button className="button button-primary" onClick={() => exportCsv('execution-report', executions)}><Download size={15} /> Export results</button></div>
    <div className="report-summary"><div><span>Pass rate</span><strong>{metrics.passRate}%</strong></div><div><span>Execution progress</span><strong>{percentage(metrics.executed, executions.length)}%</strong></div><div><span>Requirement coverage</span><strong>{metrics.coverage}%</strong></div><div><span>Automation coverage</span><strong>{metrics.automation}%</strong></div><div><span>Defect density</span><strong>{metrics.executed ? (defects.length / metrics.executed).toFixed(2) : '0.00'}</strong></div></div>
    <div className="reports-grid"><section className="panel report-panel"><div className="panel-heading"><div><span className="eyebrow">TEST EXECUTION REPORT</span><h2>Result distribution</h2></div><span className="report-period">All runs</span></div><div className="bar-chart">{counts.map((item) => <div className="bar-row" key={item.status}><span>{item.status}</span><div className="bar-track"><i className={statusClass(item.status)} style={{ width: `${percentage(item.count, maxCount)}%` }} /></div><strong>{item.count}</strong></div>)}</div><div className="report-footnote">{metrics.executed} executed of {executions.length} planned executions</div></section>
      <section className="panel report-panel"><div className="panel-heading"><div><span className="eyebrow">DEFECT REPORT</span><h2>Open by severity</h2></div><span className="report-period">{defects.filter((item) => !['Closed', 'Rejected'].includes(item.status)).length} open</span></div><div className="severity-list">{severity.map((item) => <div className="severity-row" key={item.value}><span className={`severity-mark ${statusClass(item.value)}`} /> <span>{item.value}</span><div><i style={{ width: `${percentage(item.count, Math.max(1, ...severity.map((s) => s.count)))}%` }} /></div><strong>{item.count}</strong></div>)}</div><div className="report-footnote">{defects.length} total issues across {runs.length} runs</div></section>
      <section className="panel report-panel coverage-report"><div className="panel-heading"><div><span className="eyebrow">TRACEABILITY MATRIX</span><h2>Requirements coverage</h2></div><span className="coverage-score">{metrics.coverage}%</span></div>{requirements.map((requirement) => { const linked = cases.filter((item) => item.requirement_id === requirement.id); const related = executions.filter((item) => item.case_snapshot.requirement_id === requirement.id); const failed = related.some((item) => item.status === 'Failed'); return <div className="coverage-row" key={requirement.id}><span className="record-id">{requirement.id}</span><strong>{requirement.name}</strong><span>{linked.length} cases</span><span className={`status-pill ${statusClass(failed ? 'Failed' : linked.length ? 'Passed' : 'Not Run')}`}>{failed ? 'Failed' : linked.length ? 'Covered' : 'Uncovered'}</span></div>; })}{uncovered.length === 0 && requirements.length > 0 && <p className="report-footnote">All requirements have linked tests.</p>}</section>
      <section className="panel report-panel automation-report"><div className="panel-heading"><div><span className="eyebrow">AUTOMATION COVERAGE</span><h2>Test case mix</h2></div><span className="report-period">{cases.length} test cases</span></div><div className="automation-meter"><i style={{ width: `${metrics.automation}%` }} /></div><div className="automation-legend"><span><i className="legend-dot passed" /> Automated <strong>{cases.filter((item) => item.automation_status === 'Automated').length}</strong></span><span><i className="legend-dot not-run" /> Manual / other <strong>{cases.length - cases.filter((item) => item.automation_status === 'Automated').length}</strong></span></div><div className="report-footnote">Automation status is referenced here; external runners are not executed by this app.</div></section></div>
  </>;
}

function SettingsPage({ role }) {
  return <><div className="page-heading list-heading"><div><div className="eyebrow">WORKSPACE CONFIGURATION</div><h1>Settings</h1><p>Architecture, roles and connected services.</p></div></div><div className="settings-grid"><section className="panel settings-panel"><span className="eyebrow">ACTIVE PROFILE</span><h2>{role}</h2><p>This local reference app demonstrates role selection in the interface. It does not enforce authentication or record-level access.</p><div className="settings-status"><span className="live-dot" /> Demo access controls only</div></section><section className="panel settings-panel"><span className="eyebrow">DATA STORAGE</span><h2>SQLite · local file</h2><p>Records are stored in <code>data/qa-management.sqlite</code>. Back up this file before resetting or moving the workspace.</p><div className="settings-status"><CircleCheck size={15} /> Persistent local database</div></section><section className="panel settings-panel"><span className="eyebrow">MICROSOFT 365 TARGET</span><h2>SharePoint + Power Platform</h2><p>Production deployment and M365 capability boundaries are documented in the project architecture.</p><a className="inline-link" href="/ARCHITECTURE.md" target="_blank">Open architecture guide <ExternalLink size={13} /></a></section><section className="panel settings-panel"><span className="eyebrow">EXTERNAL INTEGRATIONS</span><h2>Jira & CI runners</h2><p>Jira links can be recorded on defects. Direct synchronization and automation-result ingestion need a secured API integration.</p><div className="settings-status"><Clock3 size={15} /> Integration-ready references</div></section></div></>;
}

function CreateDialog({ modal, data, projectId, save, close }) {
  const [form, setForm] = useState(() => ({ project_id: projectId, status: 'Draft', priority: 'Medium', severity: 'Medium', environment: 'QA', ...initialForm(modal) }));
  const [steps, setSteps] = useState([{ action: '', test_data: '', expected_result: '' }]);
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const addStep = () => setSteps((current) => [...current, { action: '', test_data: '', expected_result: '' }]);
  const projectPlans = data.plans.filter((item) => item.project_id === projectId);
  const projectSuites = data.suites.filter((item) => item.project_id === projectId);
  const projectRequirements = data.requirements.filter((item) => item.project_id === projectId);
  const execution = modal.execution;
  const failedStep = modal.failedStep;
  const isCase = modal.kind === 'case';
  const isRun = modal.kind === 'run';
  const isDefect = modal.kind === 'defect';
  const title = ({ project: 'Create project', plan: 'Create test plan', suite: 'Create test suite', case: 'Create test case', run: 'Create test run', defect: 'Create defect from failure', requirement: 'Create requirement', user: 'Add team member' })[modal.kind] || 'Create record';
  const field = (label, key, options, placeholder = '') => <label className="form-field"><span>{label}</span>{options ? <select value={form[key] ?? ''} onChange={(event) => set(key, event.target.value)}><option value="">Select {label.toLowerCase()}</option>{options.map((option) => typeof option === 'string' ? <option key={option}>{option}</option> : <option key={option.id} value={option.id}>{option.name || option.title}</option>)}</select> : <input value={form[key] ?? ''} placeholder={placeholder} onChange={(event) => set(key, event.target.value)} />}</label>;
  const area = (label, key, placeholder = '') => <label className="form-field wide-field"><span>{label}</span><textarea rows="3" value={form[key] ?? ''} placeholder={placeholder} onChange={(event) => set(key, event.target.value)} /></label>;
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const kind = modal.kind;
    const endpoint = { case: '/cases', run: '/runs', project: '/projects', plan: '/plans', suite: '/suites', defect: '/defects', requirement: '/requirements', user: '/users' }[kind];
    const payload = { ...form, project_id: form.project_id || projectId };
    if (isCase) payload.steps = steps;
    if (isRun) { payload.start_date = new Date().toISOString().slice(0, 10); payload.status = 'Not Started'; }
    if (isDefect && execution) {
      payload.project_id = projectId;
      payload.case_id = execution.case_id;
      payload.run_id = execution.run_id;
      payload.execution_id = execution.id;
      payload.requirement_id = execution.case_snapshot.requirement_id;
      payload.environment = execution.environment;
      payload.build = execution.build;
      payload.reporter = execution.tester;
      payload.actual_result = payload.actual_result || execution.actual_result;
      payload.failed_step_id = failedStep?.step_id || '';
      payload.steps_to_reproduce = failedStep?.step_snapshot?.action || '';
      payload.expected_result = failedStep?.step_snapshot?.expected_result || '';
      payload.status = 'New';
    }
    delete payload.id;
    await save(endpoint, payload);
    setBusy(false);
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><div><span className="eyebrow">{modal.kind === 'defect' ? 'FAILED TEST WORKFLOW' : 'QA WORKSPACE'}</span><h2 id="dialog-title">{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18} /></button></div><form onSubmit={submit}><div className="form-grid">
    {modal.kind === 'project' && <>{field('Project name','name',null,'e.g. Customer Portal')}{field('Product / application','product',null,'Product name')}{field('Project manager','manager',null,'Name')}{field('QA lead','qa_lead',null,'Name')}{field('Environment','environment',['Development','QA','Staging','Production'])}{field('Status','status',['Active','On Hold','Completed','Archived'])}{area('Description','description')}</>}
    {modal.kind === 'plan' && <>{field('Test plan name','name',null,'e.g. Release 5.3 Regression')}{field('Project','project_id',data.projects)}{field('Status','status',['Draft','Planned','In Progress','Completed','Archived'])}{field('Priority','priority',['Critical','High','Medium','Low'])}{field('Test lead','lead',null,'Name')}{field('Environment','environment',['Development','QA','Staging','Production'])}{field('Start date','start_date')}{field('End date','end_date')}{field('Build / version','build',null,'Build number')}{area('Testing scope','scope')}{area('Objectives','objectives')}{area('Test strategy','strategy')}</>}
    {modal.kind === 'suite' && <>{field('Suite name','name',null,'e.g. Payments')}{field('Test plan','plan_id',projectPlans)}{field('Parent suite','parent_id',[{ id: '', name: 'No parent (top level)' }, ...projectSuites])}{field('Owner','owner',null,'Name')}{area('Description','description')}</>}
    {isCase && <>{field('Test case title','title',null,'e.g. Verify a customer can sign in')}{field('Test plan','plan_id',projectPlans)}{field('Test suite','suite_id',projectSuites)}{field('Requirement','requirement_id',projectRequirements)}{field('Priority','priority',['Critical','High','Medium','Low'])}{field('Test type','test_type',['Functional','Regression','Smoke','Sanity','Integration','API','UI','Performance','Security','Compatibility','User Acceptance'])}{field('Assigned tester','assigned_to',data.users.filter((user) => user.role.includes('QA')))}{field('Automation status','automation_status',['Manual','Automated','In Development','Not Automatable'])}{area('Preconditions','preconditions')}{field('Tags','tags',null,'@regression @smoke')}<div className="steps-editor"><div className="step-editor-heading"><strong>Test steps</strong><button type="button" className="text-button" onClick={addStep}><Plus size={14} /> Add step</button></div>{steps.map((step, index) => <div className="step-input-row" key={index}><span>{String(index + 1).padStart(2, '0')}</span><input aria-label={`Step ${index + 1} action`} placeholder="Action" value={step.action} onChange={(event) => setSteps((current) => current.map((item, position) => position === index ? { ...item, action: event.target.value } : item))} /><input aria-label={`Step ${index + 1} expected result`} placeholder="Expected result" value={step.expected_result} onChange={(event) => setSteps((current) => current.map((item, position) => position === index ? { ...item, expected_result: event.target.value } : item))} />{steps.length > 1 && <button type="button" className="row-delete" onClick={() => setSteps((current) => current.filter((_, position) => position !== index))} aria-label="Remove step">×</button>}</div>)}</div></>}
    {isRun && <>{field('Test run name','name',null,'e.g. Sprint 25 Smoke')}{field('Test plan','plan_id',projectPlans)}{field('Test suite','suite_id',projectSuites)}<p className="form-hint wide-field">All cases in the selected suite are snapshotted into this run when it is created.</p>{field('Build / version','build',null,'Build identifier')}{field('Environment','environment',['Development','QA','Staging','Production'])}{field('Browser','browser',['Chrome','Edge','Firefox','Safari'])}{field('Device','device',['Desktop','Tablet','Mobile'])}{field('Assigned tester','assigned_to',data.users.filter((user) => user.role.includes('QA')))}</>}
    {isDefect && <>{field('Defect title','title',null,'Short description of the issue')}{field('Severity','severity',['Critical','High','Medium','Low'])}{field('Priority','priority',['Critical','High','Medium','Low'])}{field('Assigned developer','assigned_developer',data.users.filter((user) => user.role === 'Developer'))}{field('Jira issue URL','external_issue_url',null,'https://jira.example.com/browse/PROJ-123')}{area('Description','description','What happened?')}{area('Steps to reproduce','steps_to_reproduce','How can another person reproduce this?')}{field('Expected result','expected_result',null,'')}{field('Actual result','actual_result',null,'')}</>}
    {modal.kind === 'requirement' && <>{field('Requirement name','name',null,'e.g. Customers can update their profile')}{field('Feature','feature',null,'Feature area')}{field('Priority','priority',['Critical','High','Medium','Low'])}{field('Source','source',['Product','Operations','Compliance','Customer feedback'])}{field('Status','status',['Proposed','Approved','Implemented','Deprecated'])}{area('Description','description')}{area('Acceptance criteria','acceptance_criteria')}</>}
    {modal.kind === 'user' && <>{field('Name','name',null,'Full name')}{field('Email','email',null,'name@example.com')}{field('Role','role',roleOptions)}<input type="hidden" value={projectId} /></>}
    </div><div className="dialog-footer"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : isDefect ? 'Create linked defect' : `Create ${kindLabel(modal.kind)}`}</button></div></form></section></div>;
}
function kindLabel(kind) { return ({ project: 'project', plan: 'plan', suite: 'suite', case: 'test case', run: 'test run', defect: 'defect', requirement: 'requirement', user: 'team member' })[kind]; }
function initialForm(modal) {
  if (modal.kind !== 'defect' || !modal.execution) return {};
  return { title: '', severity: 'Medium', priority: 'Medium', status: 'New', actual_result: modal.execution.actual_result || '', description: `Failed test: ${modal.execution.case_snapshot.id} ${modal.execution.case_snapshot.title}` };
}

export default App;
