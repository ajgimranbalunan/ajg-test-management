import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, BarChart3, Check, ChevronDown, CircleCheck, CircleHelp, ClipboardList,
  Clock3, Download, ExternalLink, FileText, FolderKanban, Layers, LayoutDashboard,
  ListChecks, Menu, Play, Plus, Search, Settings, Users, X, Edit2, Trash2, CheckSquare, Square,
} from 'lucide-react';
import { ProjectsView } from './ProjectsView.jsx';
import { TestCasesView } from './TestCasesView.jsx';
import { TestRunsView } from './TestRunsView.jsx';
import { TestPlansView } from './TestPlansView.jsx';

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Test Plans', icon: ClipboardList },
  { label: 'Test Cases', icon: FileText },
  { label: 'Test Runs', icon: Play },
  { label: 'Requirements', icon: CircleCheck },
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
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');

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
  const currentUser = useMemo(() => data.users.find((person) => person.role === role) || { name: 'QA Admin', role }, [data.users, role]);
  const inProject = (items) => items.filter((item) => item.project_id === projectId);
  const projectCases = inProject(data.cases);
  const projectRuns = inProject(data.runs);
  const projectPlans = inProject(data.plans);
  const projectRequirements = inProject(data.requirements);
  const projectExecutions = data.executions.filter((item) => pick(data.runs, item.run_id)?.project_id === projectId);
  const metrics = useMemo(() => {
    const executed = projectExecutions.filter((item) => !['Not Run', 'Skipped'].includes(item.status));
    const passed = projectExecutions.filter((item) => item.status === 'Passed').length;
    const failed = projectExecutions.filter((item) => item.status === 'Failed').length;
    const linkedRequirements = projectRequirements.filter((requirement) => projectCases.some((testCase) => testCase.requirement_id === requirement.id)).length;
    const automated = projectCases.filter((item) => item.automation_status === 'Automated').length;
    return {
      passed, failed,
      blocked: projectExecutions.filter((item) => item.status === 'Blocked').length,
      skipped: projectExecutions.filter((item) => item.status === 'Skipped').length,
      notRun: projectExecutions.filter((item) => item.status === 'Not Run').length,
      passRate: percentage(passed, executed.length),
      coverage: percentage(linkedRequirements, projectRequirements.length),
      automation: percentage(automated, projectCases.length),
      executed: executed.length,
    };
  }, [projectCases, projectExecutions, projectRequirements]);

  const announce = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };
  const save = async (path, body, method = 'POST') => {
    try {
      await request(path, { method, body: JSON.stringify(body) });
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
    'Test Runs': 'run', Requirements: 'requirement', Team: 'user',
  }[active];
  const canEdit = role === 'QA Administrator'
    || (role === 'Test Lead' && ['Test Plans', 'Test Suites', 'Test Cases', 'Test Runs', 'Requirements'].includes(active));
  const activeTitle = active;

  return (
    <div className="app-shell" onClick={() => projectDropdownOpen && setProjectDropdownOpen(false)}>
      <aside className="sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="brand-lockup"><div className="brand-mark">Q</div><div><strong>QUALITY</strong><span>ASSURANCE</span></div></div>
        <div className="workspace-label">WORKSPACE</div>

        {/* BrowserStack Style Project Selector Dropdown */}
        <div className="sidebar-project-selector-wrap">
          <button
            type="button"
            className="sidebar-project-btn"
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            title="Click to select project or view all"
          >
            <div className="sidebar-proj-left">
              <FolderKanban size={16} className="sidebar-proj-icon" />
              <div className="sidebar-proj-texts">
                <span className="sidebar-proj-label">PROJECT</span>
                <span className="sidebar-proj-name">{project?.name || 'Select project'}</span>
              </div>
            </div>
            <ChevronDown size={14} style={{ color: '#94a3b8' }} />
          </button>

          {projectDropdownOpen && (
            <div className="sidebar-project-menu">
              <div className="menu-search-box">
                <Search size={13} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  autoFocus
                />
                {projectSearchQuery && (
                  <button className="icon-button" onClick={() => setProjectSearchQuery('')}>
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="menu-project-list">
                {data.projects
                  .filter((p) =>
                    p.name.toLowerCase().includes(projectSearchQuery.toLowerCase()) ||
                    p.id.toLowerCase().includes(projectSearchQuery.toLowerCase())
                  )
                  .map((p) => {
                    const isCurrent = p.id === projectId;
                    return (
                      <button
                        key={p.id}
                        className={`menu-project-item ${isCurrent ? 'active' : ''}`}
                        onClick={() => {
                          setProjectId(p.id);
                          setProjectDropdownOpen(false);
                          announce(`Switched to "${p.name}"`);
                        }}
                      >
                        <span>{p.name}</span>
                        {isCurrent && <Check size={14} className="text-success" />}
                      </button>
                    );
                  })}
              </div>

              <div className="menu-footer">
                <button
                  className="menu-footer-btn"
                  onClick={() => {
                    setActive('Projects');
                    setProjectDropdownOpen(false);
                  }}
                >
                  <FolderKanban size={13} />
                  <span>View All Projects</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${active === label ? 'selected' : ''}`}
              onClick={() => { setActive(label); setStatusFilter('All statuses'); }}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="help-mark"><CircleHelp size={16} /><span>Workspace help</span></div><div className="profile-chip"><div className="avatar">{(currentUser.name || 'QA').split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div className="profile-copy"><strong>{currentUser.name}</strong><span>{role}</span></div><ChevronDown size={15} /></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeTitle}</strong></div>
          <div className="topbar-actions">
            <label className="project-switcher">
              <span>PROJECT</span>
              <select aria-label="Select project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <div className="top-divider" />
            <label className="role-switcher">
              <span>VIEW AS</span>
              <select aria-label="Choose role preview" value={role} onChange={(event) => setRole(event.target.value)}>
                {roleOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <button className="top-avatar" title={currentUser.name}>{(currentUser.name || 'QA').split(' ').map((part) => part[0]).slice(0, 2).join('')}</button>
          </div>
        </header>

        <section className="page-wrap">
          {error && <div className="notice error-notice">API connection: {error}. Start the local app with <code>npm run dev</code>.</div>}
          {loading ? <div className="loading-panel">Loading QA workspace…</div> : <>
            {active === 'Dashboard' && (
              <Dashboard project={project} plans={projectPlans} cases={projectCases} runs={projectRuns} executions={projectExecutions} requirements={projectRequirements} metrics={metrics} onNavigate={setActive} />
            )}
            {active === 'Projects' && (
              <ProjectsView data={data} projectId={projectId} setProjectId={setProjectId} role={role} canEdit={canEdit} currentUser={currentUser} refresh={refresh} announce={announce} openModal={openCreate} request={request} onNavigate={setActive} />
            )}
            {active === 'Test Cases' && (
              <TestCasesView data={data} projectId={projectId} role={role} canEdit={canEdit} currentUser={currentUser} refresh={refresh} announce={announce} openModal={openCreate} request={request} />
            )}
            {active === 'Test Runs' && (
              <TestRunsView data={data} projectId={projectId} role={role} canEdit={canEdit} currentUser={currentUser} refresh={refresh} announce={announce} openModal={openCreate} request={request} />
            )}
            {active === 'Test Plans' && (
              <TestPlansView data={data} projectId={projectId} role={role} canEdit={canEdit} currentUser={currentUser} refresh={refresh} announce={announce} openModal={openCreate} request={request} onNavigate={setActive} />
            )}
            {(active === 'Reports' || active === 'Reports & Analytics') && (
              <Reports project={project} cases={projectCases} runs={projectRuns} executions={projectExecutions} requirements={projectRequirements} metrics={metrics} exportCsv={exportCsv} />
            )}
            {active === 'Settings' && <SettingsPage role={role} />}
            {active !== 'Dashboard' && active !== 'Projects' && active !== 'Test Cases' && active !== 'Test Runs' && active !== 'Test Plans' && active !== 'Reports' && active !== 'Reports & Analytics' && active !== 'Settings' && (
              <EntityPage
                active={active} project={project} data={data} items={pageItems(active, { projectId, data, projectCases, projectRuns, projectPlans, projectRequirements, projectDefects })}
                query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                onCreate={() => openCreate(pageAddKind)} onExport={exportCsv} canEdit={canEdit} role={role}
                onEdit={(item) => openCreate(`${pageAddKind}_edit`, { [pageAddKind === 'case' ? 'testCase' : pageAddKind]: item })}
                onDelete={(item) => openCreate('confirm_delete', {
                  resource: pageAddKind === 'case' ? 'cases' : pageAddKind === 'plan' ? 'plans' : pageAddKind === 'suite' ? 'suites' : pageAddKind === 'run' ? 'runs' : pageAddKind === 'requirement' ? 'requirements' : 'users',
                  id: item.id,
                  title: `Delete ${pageAddKind} "${item.name || item.title || item.id}"`,
                  message: `Are you sure you want to delete ${item.name || item.title || item.id}? Associated records will be safely cleaned up.`,
                  onConfirm: async () => {
                    try {
                      const res = pageAddKind === 'case' ? 'cases' : pageAddKind === 'plan' ? 'plans' : pageAddKind === 'suite' ? 'suites' : pageAddKind === 'run' ? 'runs' : pageAddKind === 'requirement' ? 'requirements' : 'users';
                      await request(`/${res}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
                      await refresh();
                      announce('Record deleted');
                    } catch (e) { announce(e.message); }
                  }
                })}
                onUpdate={async (resource, id, body) => { try { await request(`/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }); await refresh(); announce('Status updated'); } catch (updateError) { announce(updateError.message); } }}
              />
            )}
          </>}
        </section>
      </main>
      {modal && <CreateDialog modal={modal} data={data} projectId={projectId} save={save} close={() => setModal(null)} currentUser={currentUser} />}
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

function Dashboard({ project, plans, cases, runs, executions, requirements, metrics, onNavigate }) {
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
      </section>
      <section className="panel results-panel"><div className="panel-heading"><div><span className="eyebrow">LATEST EXECUTION</span><h2>Test results</h2></div><button className="text-button" onClick={() => onNavigate('Test Runs')}>All runs <span>↗</span></button></div><div className="result-summary"><div className="donut" style={{ '--passed': percentage(metrics.passed, executions.length) }}><div><strong>{metrics.passRate}%</strong><span>pass rate</span></div></div><div className="result-legend">{resultCount.map(({ status, count }) => <div className="legend-row" key={status}><i className={`legend-dot ${statusClass(status)}`} /><span>{status}</span><strong>{count}</strong></div>)}</div></div></section>
      <section className="panel release-panel"><div className="panel-heading"><div><span className="eyebrow">RELEASE READINESS</span><h2>{activePlan?.name || 'No active plan'}</h2></div><span className={`status-pill ${statusClass(activePlan?.status || 'Planned')}`}>{activePlan?.status || 'Planned'}</span></div><div className="release-progress-label"><span>Execution progress</span><strong>{planProgress}%</strong></div><div className="progress-track"><i style={{ width: `${planProgress}%` }} /></div><div className="release-stats"><div><strong>{cases.filter((item) => item.plan_id === activePlan?.id).length}</strong><span>cases</span></div><div><strong>{executions.filter((item) => runs.find((run) => run.id === item.run_id)?.plan_id === activePlan?.id && item.status === 'Failed').length}</strong><span>failed</span></div><div><strong>{metrics.coverage}%</strong><span>coverage</span></div></div><button className="panel-link" onClick={() => onNavigate('Test Plans')}>View plan details <span>→</span></button></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">WORK IN MOTION</span><h2>Recent test runs</h2></div><button className="icon-button" title="View all runs" onClick={() => onNavigate('Test Runs')}><ExternalLink size={15} /></button></div>{runs.slice(0, 4).map((run) => { const runExecutions = executions.filter((item) => item.run_id === run.id); const runPassed = runExecutions.filter((item) => item.status === 'Passed').length; const progress = percentage(runExecutions.filter((item) => !['Not Run', 'Skipped'].includes(item.status)).length, runExecutions.length); return <button key={run.id} className="run-row" onClick={() => onNavigate('Test Execution')}><div className="run-icon"><Play size={14} /></div><div className="run-info"><strong>{run.name}</strong><span>{run.id} <i>·</i> {run.environment} <i>·</i> {run.assigned_to || 'Unassigned'}</span></div><div className="run-progress"><span>{runPassed} passed</span><i><b style={{ width: `${progress}%` }} /></i></div><span className={`status-pill ${statusClass(run.status)}`}>{run.status}</span></button>; })}</section>
      <section className="panel coverage-panel"><div className="panel-heading"><div><span className="eyebrow">TRACEABILITY</span><h2>Requirement coverage</h2></div><button className="text-button" onClick={() => onNavigate('Requirements')}>Matrix <span>↗</span></button></div><div className="coverage-big"><strong>{metrics.coverage}<small>%</small></strong><span>{requirements.filter((item) => cases.some((testCase) => testCase.requirement_id === item.id)).length} of {requirements.length} requirements covered</span></div><div className="coverage-track"><i style={{ width: `${metrics.coverage}%` }} /></div><div className="coverage-note"><span><i className="coverage-key covered" /> Covered</span><span><i className="coverage-key uncovered" /> No linked tests</span></div></section>
    </div>
  </>;
}

function Kpi({ label, value, detail, icon: Icon, tone }) {
  return <div className={`kpi-card tone-${tone}`}><div className="kpi-top"><span>{label}</span><div className="kpi-icon"><Icon size={17} /></div></div><strong className="kpi-number">{value}</strong><span className="kpi-detail">{detail}</span></div>;
}

function EntityPage({ active, project, items, data, query, setQuery, statusFilter, setStatusFilter, onCreate, onExport, canEdit, role, onUpdate, onEdit, onDelete }) {
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
    <div className="table-panel"><div className="table-scroll"><table><thead><tr><th className="check-column"><input type="checkbox" aria-label="Select all rows" /></th>{columns.map((column) => <th key={column}>{toLabel(column)}</th>)}<th style={{ textAlign: 'right' }}>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id || row.name}><td><input type="checkbox" aria-label={`Select ${row.id || row.name}`} /></td>{columns.map((column) => <td key={column}>{active === 'Defects / Issues' && column === 'status' && canUpdateDefect(row, role, data) ? <select className="inline-status" aria-label={`Update ${row.id} status`} value={row.status} onChange={(event) => onUpdate('defects', row.id, { status: event.target.value })}>{['New','Open','In Progress','Fixed','Retest','Reopened','Closed','Rejected'].map((status) => <option key={status}>{status}</option>)}</select> : renderCell(column, row, data)}</td>)}<td style={{ textAlign: 'right' }}><div className="table-actions-cell">{canEdit && onEdit && <button className="icon-button" title="Edit record" onClick={() => onEdit(row)}><Edit2 size={13} /></button>}{canEdit && onDelete && <button className="icon-button text-danger" title="Delete record" onClick={() => onDelete(row)}><Trash2 size={13} /></button>}</div></td></tr>)}</tbody></table></div>{rows.length === 0 && <div className="empty-state"><Search size={22} /><strong>No matching records</strong><span>Try changing the search or filters.</span></div>}<div className="table-footer"><span>Showing <strong>{rows.length}</strong> of <strong>{items.length}</strong> records</span><span>{project?.id || ''}</span></div></div>
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

function Reports({ project, cases, runs, executions, requirements, metrics, exportCsv }) {
  const counts = statuses.map((status) => ({ status, count: executions.filter((item) => item.status === status).length }));
  const maxCount = Math.max(1, ...counts.map((item) => item.count));
  const uncovered = requirements.filter((requirement) => !cases.some((item) => item.requirement_id === requirement.id));
  return <>
    <div className="page-heading list-heading"><div><div className="eyebrow">{project?.name} <span className="heading-separator">/</span> QUALITY INTELLIGENCE</div><h1>Reports & analytics</h1><p>Execution health, requirement traceability and release risks.</p></div><button className="button button-primary" onClick={() => exportCsv('execution-report', executions)}><Download size={15} /> Export results</button></div>
    <div className="report-summary"><div><span>Pass rate</span><strong>{metrics.passRate}%</strong></div><div><span>Execution progress</span><strong>{percentage(metrics.executed, executions.length)}%</strong></div><div><span>Requirement coverage</span><strong>{metrics.coverage}%</strong></div><div><span>Automation coverage</span><strong>{metrics.automation}%</strong></div></div>
    <div className="reports-grid"><section className="panel report-panel"><div className="panel-heading"><div><span className="eyebrow">TEST EXECUTION REPORT</span><h2>Result distribution</h2></div><span className="report-period">All runs</span></div><div className="bar-chart">{counts.map((item) => <div className="bar-row" key={item.status}><span>{item.status}</span><div className="bar-track"><i className={statusClass(item.status)} style={{ width: `${percentage(item.count, maxCount)}%` }} /></div><strong>{item.count}</strong></div>)}</div><div className="report-footnote">{metrics.executed} executed of {executions.length} planned executions</div></section>
      <section className="panel report-panel coverage-report"><div className="panel-heading"><div><span className="eyebrow">TRACEABILITY MATRIX</span><h2>Requirements coverage</h2></div><span className="coverage-score">{metrics.coverage}%</span></div>{requirements.map((requirement) => { const linked = cases.filter((item) => item.requirement_id === requirement.id); const related = executions.filter((item) => item.case_snapshot.requirement_id === requirement.id); const failed = related.some((item) => item.status === 'Failed'); return <div className="coverage-row" key={requirement.id}><span className="record-id">{requirement.id}</span><strong>{requirement.name}</strong><span>{linked.length} cases</span><span className={`status-pill ${statusClass(failed ? 'Failed' : linked.length ? 'Passed' : 'Not Run')}`}>{failed ? 'Failed' : linked.length ? 'Covered' : 'Uncovered'}</span></div>; })}{uncovered.length === 0 && requirements.length > 0 && <p className="report-footnote">All requirements have linked tests.</p>}</section>
      <section className="panel report-panel automation-report"><div className="panel-heading"><div><span className="eyebrow">AUTOMATION COVERAGE</span><h2>Test case mix</h2></div><span className="report-period">{cases.length} test cases</span></div><div className="automation-meter"><i style={{ width: `${metrics.automation}%` }} /></div><div className="automation-legend"><span><i className="legend-dot passed" /> Automated <strong>{cases.filter((item) => item.automation_status === 'Automated').length}</strong></span><span><i className="legend-dot not-run" /> Manual / other <strong>{cases.length - cases.filter((item) => item.automation_status === 'Automated').length}</strong></span></div><div className="report-footnote">Automation status is referenced here; external runners are not executed by this app.</div></section></div>
  </>;
}

function SettingsPage({ role }) {
  return <><div className="page-heading list-heading"><div><div className="eyebrow">WORKSPACE CONFIGURATION</div><h1>Settings</h1><p>Architecture, roles and connected services.</p></div></div><div className="settings-grid"><section className="panel settings-panel"><span className="eyebrow">ACTIVE PROFILE</span><h2>{role}</h2><p>This local reference app demonstrates role selection in the interface. It does not enforce authentication or record-level access.</p><div className="settings-status"><span className="live-dot" /> Demo access controls only</div></section><section className="panel settings-panel"><span className="eyebrow">DATA STORAGE</span><h2>SQLite · local file</h2><p>Records are stored in <code>data/qa-management.sqlite</code>. Back up this file before resetting or moving the workspace.</p><div className="settings-status"><CircleCheck size={15} /> Persistent local database</div></section><section className="panel settings-panel"><span className="eyebrow">MICROSOFT 365 TARGET</span><h2>SharePoint + Power Platform</h2><p>Production deployment and M365 capability boundaries are documented in the project architecture.</p><a className="inline-link" href="/docs/ARCHITECTURE.md" target="_blank">Open architecture guide <ExternalLink size={13} /></a></section><section className="panel settings-panel"><span className="eyebrow">EXTERNAL INTEGRATIONS</span><h2>Jira & CI runners</h2><p>Jira keys and links are recorded directly on failed test executions. Direct synchronization and automation-result ingestion need a secured API integration.</p><div className="settings-status"><Clock3 size={15} /> Integration-ready references</div></section></div></>;
}

function CreateDialog({ modal, data, projectId, save, close, currentUser }) {
  const isDelete = modal.kind === 'confirm_delete';
  const isEdit = modal.kind.endsWith('_edit');
  const baseKind = isEdit ? modal.kind.replace('_edit', '') : modal.kind;
  const targetProject = modal.project_id || projectId;

  // Confirmation Delete modal
  if (isDelete) {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <section className="dialog dialog-danger" role="dialog" aria-modal="true" style={{ maxWidth: 480 }}>
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">CONFIRM DELETION</span>
              <h2>{modal.title || 'Confirm Deletion'}</h2>
            </div>
            <button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18} /></button>
          </div>
          <div style={{ padding: '20px 22px' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#334139' }}>{modal.message}</p>
            <div className="delete-warning-box">
              <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Warning: This action is permanent and will delete the record along with cascade cleanup of child records.
            </div>
          </div>
          <div className="dialog-footer">
            <button type="button" className="button button-quiet" onClick={close}>Cancel</button>
            <button
              type="button"
              className="button button-danger"
              onClick={async () => {
                if (modal.onConfirm) await modal.onConfirm();
                close();
              }}
            >
              Delete Permanently
            </button>
          </div>
        </section>
      </div>
    );
  }

  // Pre-filled editing items
  const editItem = modal.project || modal.plan || modal.suite || modal.testCase || modal.run || modal.requirement || modal.defect || {};
  const [form, setForm] = useState(() => ({
    project_id: targetProject,
    status: isEdit ? (editItem.status || 'Draft') : 'Draft',
    priority: isEdit ? (editItem.priority || 'Medium') : 'Medium',
    severity: isEdit ? (editItem.severity || 'Medium') : 'Medium',
    environment: isEdit ? (editItem.environment || 'QA') : 'QA',
    ...editItem,
    ...initialForm(modal),
  }));

  // Steps state for test cases
  const existingSteps = modal.testCase ? data.steps.filter((s) => s.case_id === modal.testCase.id) : null;
  const [steps, setSteps] = useState(() => existingSteps && existingSteps.length ? existingSteps.map(s => ({ action: s.action, test_data: s.test_data || '', expected_result: s.expected_result })) : [{ action: '', test_data: '', expected_result: '' }]);

  // Flexible Run Builder state
  const isRun = baseKind === 'run';
  const isCase = baseKind === 'case';
  const isDefect = baseKind === 'defect';

  const projectPlans = data.plans.filter((item) => item.project_id === targetProject);
  const projectSuites = data.suites.filter((item) => item.project_id === targetProject);
  const projectCases = data.cases.filter((item) => item.project_id === targetProject);
  const projectRequirements = data.requirements.filter((item) => item.project_id === targetProject);

  // Run selection mode: 'suites' | 'cases' | 'plan' | 'all'
  const [selectionMode, setSelectionMode] = useState('suites');
  const [selectedSuiteIds, setSelectedSuiteIds] = useState(() => modal.suite_id ? [modal.suite_id] : projectSuites.length ? [projectSuites[0].id] : []);
  const [selectedCaseIds, setSelectedCaseIds] = useState(() => modal.case_ids || []);
  const [caseFilterQuery, setCaseFilterQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const addStep = () => setSteps((current) => [...current, { action: '', test_data: '', expected_result: '' }]);

  // Compute selected cases for the run
  const effectiveRunCases = useMemo(() => {
    if (!isRun) return [];
    if (selectionMode === 'cases') {
      return projectCases.filter((c) => selectedCaseIds.includes(c.id));
    }
    if (selectionMode === 'suites') {
      return projectCases.filter((c) => selectedSuiteIds.includes(c.suite_id));
    }
    if (selectionMode === 'plan') {
      return projectCases.filter((c) => c.plan_id === form.plan_id || selectedSuiteIds.includes(c.suite_id));
    }
    if (selectionMode === 'all') {
      return projectCases;
    }
    return [];
  }, [isRun, selectionMode, selectedCaseIds, selectedSuiteIds, projectCases, form.plan_id]);

  const title = isEdit
    ? `Edit ${kindLabel(baseKind)}`
    : ({
        project: 'Create project', plan: 'Create test plan', suite: 'Create test suite',
        case: 'Create test case', run: 'Create test run', defect: 'Create defect from failure',
        requirement: 'Create requirement', user: 'Add team member',
      })[baseKind] || 'Create record';

  const field = (label, key, options, placeholder = '') => (
    <label className="form-field">
      <span>{label}</span>
      {options ? (
        <select value={form[key] ?? ''} onChange={(event) => set(key, event.target.value)}>
          <option value="">Select {label.toLowerCase()}</option>
          {options.map((option) =>
            typeof option === 'string' ? (
              <option key={option} value={option}>{option}</option>
            ) : (
              <option key={option.id} value={option.id}>{option.name || option.title}</option>
            )
          )}
        </select>
      ) : (
        <input value={form[key] ?? ''} placeholder={placeholder} onChange={(event) => set(key, event.target.value)} />
      )}
    </label>
  );

  const area = (label, key, placeholder = '') => (
    <label className="form-field wide-field">
      <span>{label}</span>
      <textarea rows="3" value={form[key] ?? ''} placeholder={placeholder} onChange={(event) => set(key, event.target.value)} />
    </label>
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const endpoint = { case: '/cases', run: '/runs', project: '/projects', plan: '/plans', suite: '/suites', defect: '/defects', requirement: '/requirements', user: '/users' }[baseKind];
    const payload = {
      ...form,
      project_id: form.project_id || targetProject,
      created_by: form.created_by || currentUser?.name || 'QA Admin',
    };

    if (isCase) payload.steps = steps;

    if (isRun && !isEdit) {
      payload.start_date = new Date().toISOString().slice(0, 10);
      payload.status = 'Not Started';
      if (selectionMode === 'cases') {
        payload.case_ids = selectedCaseIds;
      } else if (selectionMode === 'suites') {
        payload.suite_ids = selectedSuiteIds;
      } else if (selectionMode === 'all') {
        payload.all_project_cases = true;
      }
    }

    if (isDefect && modal.execution && !isEdit) {
      const execution = modal.execution;
      const failedStep = modal.failedStep;
      payload.project_id = targetProject;
      payload.case_id = execution.case_id;
      payload.run_id = execution.run_id;
      payload.execution_id = execution.id;
      payload.requirement_id = execution.case_snapshot?.requirement_id || '';
      payload.environment = execution.environment;
      payload.build = execution.build;
      payload.reporter = execution.tester;
      payload.actual_result = payload.actual_result || execution.actual_result;
      payload.failed_step_id = failedStep?.step_id || '';
      payload.steps_to_reproduce = failedStep?.step_snapshot?.action || '';
      payload.expected_result = failedStep?.step_snapshot?.expected_result || '';
      payload.status = 'New';
    }

    if (isEdit) {
      const recordId = editItem.id;
      delete payload.id;
      await save(`/${endpoint.replace('/api/', '')}/${encodeURIComponent(recordId)}`, payload, 'PATCH');
    } else {
      delete payload.id;
      await save(endpoint, payload, 'POST');
    }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{isEdit ? 'UPDATE RECORD' : modal.kind === 'defect' ? 'FAILED TEST WORKFLOW' : 'QA WORKSPACE'}</span>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {baseKind === 'project' && <>
              {field('Project name','name',null,'e.g. Customer Portal')}
              {field('Product / application','product',null,'Product name')}
              {field('Project manager','manager',null,'Name')}
              {field('QA lead','qa_lead',null,'Name')}
              {field('Environment','environment',['Development','QA','Staging','Production'])}
              {field('Status','status',['Active','On Hold','Completed','Archived'])}
              {field('Start date','start_date',null,'YYYY-MM-DD')}
              {field('Target release date','target_release_date',null,'YYYY-MM-DD')}
              {field('Application URL','app_url',null,'https://portal.example.test')}
              {field('Jira Project URL','jira_url',null,'https://jira.example.com/projects/PROJ')}
              {area('Description','description')}
            </>}

            {baseKind === 'plan' && <>
              {field('Test plan name','name',null,'e.g. Release 5.3 Regression')}
              {field('Project','project_id',data.projects)}
              {field('Status','status',['Draft','Planned','In Progress','Completed','Archived'])}
              {field('Priority','priority',['Critical','High','Medium','Low'])}
              {field('Test lead','lead',null,'Name')}
              {field('Environment','environment',['Development','QA','Staging','Production'])}
              {field('Start date','start_date',null,'YYYY-MM-DD')}
              {field('End date','end_date',null,'YYYY-MM-DD')}
              {field('Build / version','build',null,'Build number')}
              {area('Testing scope','scope')}
              {area('Objectives','objectives')}
              {area('Test strategy','strategy')}
            </>}

            {baseKind === 'suite' && <>
              {field('Suite name','name',null,'e.g. Authentication')}
              {field('Test plan','plan_id',projectPlans)}
              {field('Parent suite','parent_id',[{ id: '', name: 'No parent (top level)' }, ...projectSuites])}
              {field('Owner','owner',null,'Name')}
              {area('Description','description')}
            </>}

            {isCase && <>
              {field('Test case title','title',null,'e.g. Verify a customer can sign in')}
              {field('Test plan','plan_id',projectPlans)}
              {field('Test suite','suite_id',projectSuites)}
              {field('Requirement','requirement_id',projectRequirements)}
              {field('Priority','priority',['Critical','High','Medium','Low'])}
              {field('Test type','test_type',['Functional','Regression','Smoke','Sanity','Integration','API','UI','Performance','Security','Compatibility','User Acceptance'])}
              {field('Assigned tester','assigned_to',data.users.filter((user) => user.role.includes('QA')))}
              {field('Automation status','automation_status',['Manual','Automated','In Development','Not Automatable'])}
              {area('Preconditions','preconditions')}
              {field('Tags','tags',null,'@regression @smoke')}
              <div className="steps-editor">
                <div className="step-editor-heading">
                  <strong>Test steps</strong>
                  <button type="button" className="text-button" onClick={addStep}><Plus size={14} /> Add step</button>
                </div>
                {steps.map((step, index) => (
                  <div className="step-input-row" key={index}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <input aria-label={`Step ${index + 1} action`} placeholder="Action" value={step.action} onChange={(event) => setSteps((current) => current.map((item, position) => position === index ? { ...item, action: event.target.value } : item))} />
                    <input aria-label={`Step ${index + 1} expected result`} placeholder="Expected result" value={step.expected_result} onChange={(event) => setSteps((current) => current.map((item, position) => position === index ? { ...item, expected_result: event.target.value } : item))} />
                    {steps.length > 1 && <button type="button" className="row-delete" onClick={() => setSteps((current) => current.filter((_, position) => position !== index))} aria-label="Remove step">×</button>}
                  </div>
                ))}
              </div>
            </>}

            {isRun && <>
              {field('Test run name','name',null,'e.g. Sprint 25 Smoke')}
              {field('Associated Test Plan (optional)','plan_id',projectPlans)}
              {field('Build / version','build',null,'Build identifier')}
              {field('Environment','environment',['Development','QA','Staging','Production'])}
              {field('Browser','browser',['Chrome','Edge','Firefox','Safari'])}
              {field('Device','device',['Desktop','Tablet','Mobile'])}
              {field('Assigned tester','assigned_to',data.users.filter((user) => user.role.includes('QA')))}

              {!isEdit && (
                <div className="flexible-case-picker">
                  <div className="picker-top">
                    <strong>Flexible Case Execution Selection ({effectiveRunCases.length} cases selected)</strong>
                    <div className="view-mode-toggle">
                      <button type="button" className={`vm-btn ${selectionMode === 'suites' ? 'active' : ''}`} onClick={() => setSelectionMode('suites')}>By Suites</button>
                      <button type="button" className={`vm-btn ${selectionMode === 'cases' ? 'active' : ''}`} onClick={() => setSelectionMode('cases')}>Pick Cases</button>
                      {form.plan_id && <button type="button" className={`vm-btn ${selectionMode === 'plan' ? 'active' : ''}`} onClick={() => setSelectionMode('plan')}>All Plan Cases</button>}
                      <button type="button" className={`vm-btn ${selectionMode === 'all' ? 'active' : ''}`} onClick={() => setSelectionMode('all')}>All Project Cases</button>
                    </div>
                  </div>

                  {selectionMode === 'suites' && (
                    <div className="case-picker-list">
                      {projectSuites.map((s) => {
                        const sCases = projectCases.filter((c) => c.suite_id === s.id);
                        const isChecked = selectedSuiteIds.includes(s.id);
                        return (
                          <label key={s.id} className="case-picker-item">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedSuiteIds([...selectedSuiteIds, s.id]);
                                else setSelectedSuiteIds(selectedSuiteIds.filter(id => id !== s.id));
                              }}
                            />
                            <strong>{s.name}</strong>
                            <span className="record-id">{s.id}</span>
                            <span className="count-pill" style={{ marginLeft: 'auto' }}>{sCases.length} test cases</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {selectionMode === 'cases' && (
                    <div>
                      <input
                        type="text"
                        placeholder="Filter cases by title or ID…"
                        value={caseFilterQuery}
                        onChange={(e) => setCaseFilterQuery(e.target.value)}
                        style={{ width: '100%', height: 30, fontSize: 11, padding: '4px 8px', marginBottom: 6, border: '1px solid #dfe5df', borderRadius: 3 }}
                      />
                      <div className="case-picker-list">
                        {projectCases
                          .filter((c) => !caseFilterQuery || c.title.toLowerCase().includes(caseFilterQuery.toLowerCase()) || c.id.toLowerCase().includes(caseFilterQuery.toLowerCase()))
                          .map((c) => {
                            const isChecked = selectedCaseIds.includes(c.id);
                            const suite = pick(projectSuites, c.suite_id);
                            return (
                              <label key={c.id} className="case-picker-item">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedCaseIds([...selectedCaseIds, c.id]);
                                    else setSelectedCaseIds(selectedCaseIds.filter(id => id !== c.id));
                                  }}
                                />
                                <strong className="record-id">{c.id}</strong>
                                <span>{c.title}</span>
                                {suite && <small style={{ marginLeft: 'auto', color: '#687b72' }}>{suite.name}</small>}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {selectionMode === 'all' && (
                    <p style={{ margin: 0, fontSize: 11, color: '#4d6459' }}>
                      All {projectCases.length} test cases in this project will be snapshotted and queued into this run.
                    </p>
                  )}

                  {selectionMode === 'plan' && (
                    <p style={{ margin: 0, fontSize: 11, color: '#4d6459' }}>
                      All test cases associated with the selected plan will be executed.
                    </p>
                  )}
                </div>
              )}
            </>}

            {isDefect && <>
              {field('Defect title','title',null,'Short description of the issue')}
              {field('Severity','severity',['Critical','High','Medium','Low'])}
              {field('Priority','priority',['Critical','High','Medium','Low'])}
              {field('Assigned developer','assigned_developer',data.users.filter((user) => user.role === 'Developer'))}
              {field('Jira issue URL','external_issue_url',null,'https://jira.example.com/browse/PROJ-123')}
              {field('Jira issue key','jira_key',null,'e.g. PORTAL-123')}
              {area('Description','description','What happened?')}
              {area('Steps to reproduce','steps_to_reproduce','How can another person reproduce this?')}
              {field('Expected result','expected_result',null,'')}
              {field('Actual result','actual_result',null,'')}
            </>}

            {baseKind === 'requirement' && <>
              {field('Requirement name','name',null,'e.g. Customers can update their profile')}
              {field('Feature','feature',null,'Feature area')}
              {field('Priority','priority',['Critical','High','Medium','Low'])}
              {field('Source','source',['Product','Operations','Compliance','Customer feedback'])}
              {field('Status','status',['Proposed','Approved','Implemented','Deprecated'])}
              {area('Description','description')}
              {area('Acceptance criteria','acceptance_criteria')}
            </>}

            {baseKind === 'user' && <>
              {field('Name','name',null,'Full name')}
              {field('Email','email',null,'name@example.com')}
              {field('Role','role',roleOptions)}
              <input type="hidden" value={targetProject} />
            </>}
          </div>
          <div className="dialog-footer">
            <button type="button" className="button button-quiet" onClick={close}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? 'Saving…' : isEdit ? 'Save Changes' : isDefect ? 'Create Defect' : `Create ${kindLabel(baseKind)}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function kindLabel(kind) { return ({ project: 'project', plan: 'plan', suite: 'suite', case: 'test case', run: 'test run', defect: 'defect', requirement: 'requirement', user: 'team member' })[kind] || 'record'; }
function initialForm(modal) {
  if (modal.kind !== 'defect' || !modal.execution) return {};
  return { title: '', severity: 'Medium', priority: 'Medium', status: 'New', actual_result: modal.execution.actual_result || '', description: `Failed test: ${modal.execution.case_snapshot?.id || ''} ${modal.execution.case_snapshot?.title || ''}` };
}

export default App;
