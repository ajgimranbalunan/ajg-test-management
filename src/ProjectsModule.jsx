import React, { useState, useMemo } from 'react';
import {
  FolderKanban, ClipboardList, Layers, FileText, Play, ListChecks, Bug,
  CircleCheck, Search, Plus, ExternalLink, ChevronDown, ChevronRight,
  Check, X, Download, Trash2, Edit2, ArrowRight, ArrowLeft, RefreshCw,
  Eye, AlertCircle, Filter, GitBranch, ArrowDown, ShieldAlert, Sparkles,
  MoreVertical, CheckSquare, Square, CornerDownRight, Activity
} from 'lucide-react';

const toLabel = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const pick = (items, id) => items.find((item) => item.id === id);
const percentage = (num, den) => den ? Math.round((num / den) * 100) : 0;
const statusClass = (value = 'Not Run') => value.toLowerCase().replaceAll(' ', '-').replaceAll('/', '-');

export function ProjectsModule({
  data,
  projectId,
  setProjectId,
  role,
  canEdit,
  refresh,
  announce,
  onNavigate,
  openModal,
  request,
}) {
  // If user drilled into a project, selectedProjectId is set; otherwise null (shows all projects)
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' | 'plans' | 'runs' | 'requirements' | 'defects' | 'traceability'
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [actionMenuOpen, setActionMenuOpen] = useState(null);

  // Tree state
  const [treeExpanded, setTreeExpanded] = useState({
    plans: true,
    runs: true,
    requirements: true,
    defects: true,
  });
  const [selectedTreeNode, setSelectedTreeNode] = useState(null);
  const [treeSearch, setTreeSearch] = useState('');

  // Traceability filters
  const [traceFilterReq, setTraceFilterReq] = useState('All');
  const [traceFilterStatus, setTraceFilterStatus] = useState('All');

  // Currently viewed project in detail mode
  const currentProject = pick(data.projects, selectedProjectId);

  // Filtered projects list
  const filteredProjects = useMemo(() => {
    return data.projects.filter((p) => {
      const term = query.trim().toLowerCase();
      const matchesSearch = !term || [p.name, p.id, p.product, p.manager, p.qa_lead, p.description].some(
        (v) => String(v || '').toLowerCase().includes(term)
      );
      const matchesStatus = statusFilter === 'All statuses' || (p.status || 'Active') === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data.projects, query, statusFilter]);

  // Project-scoped data
  const projectScope = useMemo(() => {
    if (!selectedProjectId) return null;
    const pPlans = data.plans.filter((p) => p.project_id === selectedProjectId);
    const pPlanIds = new Set(pPlans.map((p) => p.id));
    const pSuites = data.suites.filter((s) => s.project_id === selectedProjectId);
    const pCases = data.cases.filter((c) => c.project_id === selectedProjectId);
    const pRuns = data.runs.filter((r) => r.project_id === selectedProjectId);
    const pDefects = data.defects.filter((d) => d.project_id === selectedProjectId);
    const pRequirements = data.requirements.filter((r) => r.project_id === selectedProjectId);
    const pExecutions = data.executions.filter((e) => {
      const run = pick(data.runs, e.run_id);
      return run?.project_id === selectedProjectId;
    });

    const passedExecs = pExecutions.filter((e) => e.status === 'Passed').length;
    const executedExecs = pExecutions.filter((e) => !['Not Run', 'Skipped'].includes(e.status)).length;
    const linkedReqs = pRequirements.filter((req) => pCases.some((c) => c.requirement_id === req.id)).length;
    const openDefects = pDefects.filter((d) => !['Closed', 'Rejected'].includes(d.status)).length;
    const criticalDefects = pDefects.filter((d) => d.severity === 'Critical' && !['Closed', 'Rejected'].includes(d.status)).length;

    return {
      plans: pPlans,
      suites: pSuites,
      cases: pCases,
      runs: pRuns,
      defects: pDefects,
      requirements: pRequirements,
      executions: pExecutions,
      stats: {
        passRate: percentage(passedExecs, executedExecs),
        coverage: percentage(linkedReqs, pRequirements.length),
        totalCases: pCases.length,
        totalRuns: pRuns.length,
        openDefects,
        criticalDefects,
        executedExecs,
        totalExecs: pExecutions.length,
      },
    };
  }, [selectedProjectId, data]);

  // Handle setting active project
  const handleSetActive = (id, event) => {
    if (event) event.stopPropagation();
    setProjectId(id);
    announce(`Active project set to ${pick(data.projects, id)?.name || id}`);
  };

  // Handle open project
  const handleOpenProject = (id, event) => {
    if (event) event.stopPropagation();
    setSelectedProjectId(id);
    setActionMenuOpen(null);
  };

  // Handle delete
  const handleDelete = (resource, id, label, event) => {
    if (event) event.stopPropagation();
    openModal('confirm_delete', {
      resource,
      id,
      title: `Delete ${toLabel(resource)} "${label}"`,
      message: `Are you sure you want to delete ${label}? Associated records will be safely cleaned up.`,
      onConfirm: async () => {
        try {
          await request(`/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
          await refresh();
          if (resource === 'projects' && selectedProjectId === id) {
            setSelectedProjectId(null);
          }
          announce(`${toLabel(resource)} deleted successfully.`);
        } catch (err) {
          announce(err.message);
        }
      },
    });
  };

  // Quick execution status update
  const handleQuickExecStatus = async (executionId, status) => {
    try {
      await request(`/executions/${encodeURIComponent(executionId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await refresh();
      announce(`Execution marked as ${status}`);
    } catch (err) {
      announce(err.message);
    }
  };

  // Toggle tree node expansion
  const toggleTree = (key) => {
    setTreeExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Export projects list as CSV
  const handleExportProjects = (projectsToExport = filteredProjects) => {
    if (!projectsToExport.length) return announce('Nothing to export');
    const cols = ['id', 'name', 'product', 'manager', 'qa_lead', 'status', 'environment', 'start_date', 'target_release_date'];
    const csv = [
      cols.join(','),
      ...projectsToExport.map((row) =>
        cols.map((col) => `"${String(row[col] ?? '').replaceAll('"', '""')}"`).join(',')
      ),
    ].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `qa-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    announce('Projects exported');
  };

  // Export traceability matrix
  const handleExportTraceability = () => {
    if (!projectScope) return;
    const rows = [];
    projectScope.requirements.forEach((req) => {
      const linkedCases = projectScope.cases.filter((c) => c.requirement_id === req.id);
      if (!linkedCases.length) {
        rows.push({
          requirement_id: req.id,
          requirement_name: req.name,
          requirement_status: req.status,
          case_id: 'UNCOVERED',
          case_title: 'No test case linked',
          run_id: 'N/A',
          run_name: 'N/A',
          execution_status: 'Not Run',
          defect_id: 'N/A',
          defect_title: 'N/A',
        });
      } else {
        linkedCases.forEach((c) => {
          const execs = projectScope.executions.filter((e) => e.case_id === c.id);
          if (!execs.length) {
            rows.push({
              requirement_id: req.id,
              requirement_name: req.name,
              requirement_status: req.status,
              case_id: c.id,
              case_title: c.title,
              run_id: 'N/A',
              run_name: 'Not yet scheduled in a run',
              execution_status: 'Not Run',
              defect_id: 'N/A',
              defect_title: 'N/A',
            });
          } else {
            execs.forEach((e) => {
              const run = pick(projectScope.runs, e.run_id);
              const defect = projectScope.defects.find((d) => d.execution_id === e.id || d.case_id === c.id);
              rows.push({
                requirement_id: req.id,
                requirement_name: req.name,
                requirement_status: req.status,
                case_id: c.id,
                case_title: c.title,
                run_id: run?.id || e.run_id,
                run_name: run?.name || 'Run',
                execution_status: e.status,
                defect_id: defect?.id || 'None',
                defect_title: defect?.title || 'None',
              });
            });
          }
        });
      }
    });

    const cols = ['requirement_id', 'requirement_name', 'case_id', 'case_title', 'run_id', 'run_name', 'execution_status', 'defect_id', 'defect_title'];
    const csv = [
      cols.join(','),
      ...rows.map((row) =>
        cols.map((col) => `"${String(row[col] ?? '').replaceAll('"', '""')}"`).join(',')
      ),
    ].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `traceability-${currentProject?.id || 'project'}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    announce('Traceability matrix exported');
  };

  // --------------------------------------------------------------------------
  // VIEW 1: PROJECTS PORTFOLIO (List of all projects)
  // --------------------------------------------------------------------------
  if (!selectedProjectId || !currentProject) {
    return (
      <div className="projects-portfolio">
        {/* Header */}
        <div className="page-heading list-heading">
          <div>
            <div className="eyebrow">QUALITY ASSURANCE MANAGEMENT / PORTFOLIO</div>
            <h1>Projects</h1>
            <p>Select a project to explore its Test Plans, Test Suites, Test Cases, Test Runs, Requirements, and Defects.</p>
          </div>
          <div className="heading-actions">
            {canEdit && (
              <button
                className="button button-primary"
                onClick={() => openModal('project', {})}
              >
                <Plus size={16} /> New project
              </button>
            )}
          </div>
        </div>

        {/* Portfolio KPI strip */}
        <div className="portfolio-kpi-bar">
          <div className="pkpi-item">
            <span>Total Projects</span>
            <strong>{data.projects.length}</strong>
          </div>
          <div className="pkpi-item">
            <span>Active Plans</span>
            <strong>{data.plans.filter((p) => p.status === 'In Progress').length}</strong>
          </div>
          <div className="pkpi-item">
            <span>Test Cases</span>
            <strong>{data.cases.length}</strong>
          </div>
          <div className="pkpi-item">
            <span>Test Runs</span>
            <strong>{data.runs.length}</strong>
          </div>
          <div className="pkpi-item">
            <span>Open Defects</span>
            <strong className="text-danger">{data.defects.filter((d) => !['Closed', 'Rejected'].includes(d.status)).length}</strong>
          </div>
          <div className="pkpi-item">
            <span>Requirements</span>
            <strong>{data.requirements.length}</strong>
          </div>
        </div>

        {/* Toolbar */}
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects by name, product, manager, or lead…"
            />
            {query && (
              <button className="clear-btn" onClick={() => setQuery('')}>
                <X size={13} />
              </button>
            )}
          </label>

          <label className="filter-select">
            <span>STATUS</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option>All statuses</option>
              {['Active', 'On Hold', 'Completed', 'Archived'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>

          <div className="view-mode-toggle">
            <button
              className={`vm-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Card Grid View"
            >
              <FolderKanban size={15} /> Cards
            </button>
            <button
              className={`vm-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <ListChecks size={15} /> Table
            </button>
          </div>

          <span className="table-count">{filteredProjects.length} projects</span>

          {selectedProjectIds.length > 0 && (
            <div className="bulk-actions-pill">
              <span>{selectedProjectIds.length} selected</span>
              <button
                className="button button-quiet"
                onClick={() =>
                  handleExportProjects(
                    filteredProjects.filter((p) => selectedProjectIds.includes(p.id))
                  )
                }
              >
                <Download size={13} /> Export
              </button>
              {canEdit && (
                <button
                  className="button button-danger"
                  onClick={() => {
                    openModal('confirm_delete', {
                      resource: 'projects',
                      title: `Delete ${selectedProjectIds.length} projects?`,
                      message: `Are you sure you want to delete these ${selectedProjectIds.length} projects and all associated records?`,
                      onConfirm: async () => {
                        for (const id of selectedProjectIds) {
                          await request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
                        }
                        await refresh();
                        setSelectedProjectIds([]);
                        announce('Selected projects deleted.');
                      },
                    });
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          )}

          <button
            className="button button-quiet"
            onClick={() => handleExportProjects()}
            title="Export all filtered projects"
          >
            <Download size={15} /> Export
          </button>
        </div>

        {/* Content: Cards or Table */}
        {viewMode === 'cards' ? (
          <div className="project-card-grid">
            {filteredProjects.map((p) => {
              const pPlans = data.plans.filter((item) => item.project_id === p.id);
              const pSuites = data.suites.filter((item) => item.project_id === p.id);
              const pCases = data.cases.filter((item) => item.project_id === p.id);
              const pRuns = data.runs.filter((item) => item.project_id === p.id);
              const pDefects = data.defects.filter((item) => item.project_id === p.id && !['Closed', 'Rejected'].includes(item.status));
              const isActive = projectId === p.id;

              return (
                <div
                  key={p.id}
                  className={`project-card ${isActive ? 'is-active-project' : ''}`}
                  onClick={() => handleOpenProject(p.id)}
                >
                  <div className="project-card-top">
                    <div className="p-header-left">
                      <span className="record-id">{p.id}</span>
                      <span className={`status-pill ${statusClass(p.status)}`}>{p.status || 'Active'}</span>
                      <span className="env-pill">{p.environment || 'QA'}</span>
                      {isActive && <span className="active-badge">ACTIVE SCOPE</span>}
                    </div>

                    <div className="p-header-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`icon-button ${isActive ? 'active-toggle' : ''}`}
                        title={isActive ? 'Currently active project' : 'Set as active project'}
                        onClick={(e) => handleSetActive(p.id, e)}
                      >
                        <Check size={14} className={isActive ? 'text-green' : ''} />
                      </button>
                      <button
                        className="icon-button"
                        title="Edit project"
                        onClick={() => openModal('project_edit', { project: p })}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="icon-button text-danger"
                        title="Delete project"
                        onClick={(e) => handleDelete('projects', p.id, p.name, e)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <h3 className="project-card-title">{p.name}</h3>
                  <p className="project-card-product">{p.product || 'Enterprise QA'}</p>
                  <p className="project-card-desc">{p.description || 'No description provided.'}</p>

                  <div className="project-card-meta">
                    <div>
                      <span>MANAGER</span>
                      <strong>{p.manager || 'Unassigned'}</strong>
                    </div>
                    <div>
                      <span>QA LEAD</span>
                      <strong>{p.qa_lead || 'Unassigned'}</strong>
                    </div>
                  </div>

                  {/* Project entity counters */}
                  <div className="project-card-stats">
                    <div title="Test Plans in this project">
                      <ClipboardList size={13} />
                      <strong>{pPlans.length}</strong>
                      <small>Plans</small>
                    </div>
                    <div title="Test Suites in this project">
                      <Layers size={13} />
                      <strong>{pSuites.length}</strong>
                      <small>Suites</small>
                    </div>
                    <div title="Test Cases in this project">
                      <FileText size={13} />
                      <strong>{pCases.length}</strong>
                      <small>Cases</small>
                    </div>
                    <div title="Test Runs in this project">
                      <Play size={13} />
                      <strong>{pRuns.length}</strong>
                      <small>Runs</small>
                    </div>
                    <div title="Open defects in this project">
                      <Bug size={13} />
                      <strong className={pDefects.length > 0 ? 'text-coral' : ''}>{pDefects.length}</strong>
                      <small>Defects</small>
                    </div>
                  </div>

                  <div className="project-card-footer" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="button button-primary open-hub-btn"
                      onClick={() => handleOpenProject(p.id)}
                    >
                      Open Project Hub <ArrowRight size={14} />
                    </button>
                    <div className="quick-add-group">
                      <button
                        className="button button-quiet"
                        title="Add Test Plan"
                        onClick={() => openModal('plan', { project_id: p.id })}
                      >
                        <Plus size={13} /> Plan
                      </button>
                      <button
                        className="button button-quiet"
                        title="Add Test Run"
                        onClick={() => openModal('run', { project_id: p.id })}
                      >
                        <Plus size={13} /> Run
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="table-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="check-column">
                      <input
                        type="checkbox"
                        checked={
                          filteredProjects.length > 0 &&
                          selectedProjectIds.length === filteredProjects.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProjectIds(filteredProjects.map((p) => p.id));
                          } else {
                            setSelectedProjectIds([]);
                          }
                        }}
                      />
                    </th>
                    <th>ID</th>
                    <th>Project Name</th>
                    <th>Product</th>
                    <th>Manager</th>
                    <th>QA Lead</th>
                    <th>Environment</th>
                    <th>Status</th>
                    <th>Plans</th>
                    <th>Cases</th>
                    <th>Runs</th>
                    <th>Defects</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((p) => {
                    const isChecked = selectedProjectIds.includes(p.id);
                    const isActive = projectId === p.id;
                    const pPlans = data.plans.filter((item) => item.project_id === p.id);
                    const pCases = data.cases.filter((item) => item.project_id === p.id);
                    const pRuns = data.runs.filter((item) => item.project_id === p.id);
                    const pDefects = data.defects.filter((item) => item.project_id === p.id && !['Closed', 'Rejected'].includes(item.status));

                    return (
                      <tr
                        key={p.id}
                        className={isActive ? 'active-row' : ''}
                        onDoubleClick={() => handleOpenProject(p.id)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProjectIds([...selectedProjectIds, p.id]);
                              } else {
                                setSelectedProjectIds(selectedProjectIds.filter((id) => id !== p.id));
                              }
                            }}
                          />
                        </td>
                        <td>
                          <span className="record-id">{p.id}</span>
                        </td>
                        <td>
                          <button
                            className="link-title-btn"
                            onClick={() => handleOpenProject(p.id)}
                          >
                            <strong>{p.name}</strong>
                          </button>
                        </td>
                        <td>{p.product || '—'}</td>
                        <td>{p.manager || '—'}</td>
                        <td>{p.qa_lead || '—'}</td>
                        <td>
                          <span className="env-pill">{p.environment || 'QA'}</span>
                        </td>
                        <td>
                          <span className={`status-pill ${statusClass(p.status)}`}>
                            {p.status || 'Active'}
                          </span>
                        </td>
                        <td><span className="count-cell">{pPlans.length}</span></td>
                        <td><span className="count-cell">{pCases.length}</span></td>
                        <td><span className="count-cell">{pRuns.length}</span></td>
                        <td>
                          <span className={`count-cell ${pDefects.length ? 'text-coral' : ''}`}>
                            {pDefects.length}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="table-actions-cell">
                            <button
                              className="button button-quiet btn-compact"
                              onClick={() => handleOpenProject(p.id)}
                              title="Explore Project"
                            >
                              Explore
                            </button>
                            <button
                              className={`button button-quiet btn-compact ${isActive ? 'btn-active-scope' : ''}`}
                              onClick={(e) => handleSetActive(p.id, e)}
                              title="Set as global active project"
                            >
                              {isActive ? 'Active' : 'Set Active'}
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => openModal('project_edit', { project: p })}
                              title="Edit project"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              className="icon-button text-danger"
                              onClick={(e) => handleDelete('projects', p.id, p.name, e)}
                              title="Delete project"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredProjects.length === 0 && (
              <div className="empty-state">
                <FolderKanban size={26} />
                <strong>No projects found</strong>
                <span>Try changing search terms or create a new project.</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW 2: INSIDE THE PROJECT (Project Hub / Hierarchy Explorer)
  // --------------------------------------------------------------------------
  const { plans, suites, cases, runs, defects, requirements, executions, stats } = projectScope;

  return (
    <div className="project-detail-view">
      {/* Breadcrumb Header */}
      <div className="project-hub-topbar">
        <div className="hub-breadcrumbs">
          <button
            className="back-btn"
            onClick={() => setSelectedProjectId(null)}
            title="Return to projects list"
          >
            <ArrowLeft size={14} /> Back to Projects
          </button>
          <span className="crumb-sep">/</span>
          <span className="record-id">{currentProject.id}</span>
          <span className="crumb-sep">/</span>
          <strong className="current-proj-name">{currentProject.name}</strong>
        </div>

        <div className="hub-top-actions">
          {projectId !== currentProject.id ? (
            <button
              className="button button-quiet"
              onClick={(e) => handleSetActive(currentProject.id, e)}
              title="Set this project as the active scope in the topbar"
            >
              <Check size={14} /> Make Active Project
            </button>
          ) : (
            <span className="active-scope-badge">
              <Check size={12} /> CURRENT ACTIVE SCOPE
            </span>
          )}

          <button
            className="button button-quiet"
            onClick={() => openModal('project_edit', { project: currentProject })}
            title="Edit Project Details"
          >
            <Edit2 size={13} /> Edit Project
          </button>

          <button
            className="button button-danger"
            onClick={(e) => handleDelete('projects', currentProject.id, currentProject.name, e)}
            title="Delete this project"
          >
            <Trash2 size={13} /> Delete Project
          </button>
        </div>
      </div>

      {/* Project Banner & Quick Stats */}
      <div className="project-banner">
        <div className="banner-main">
          <div className="banner-badges">
            <span className="record-id">{currentProject.id}</span>
            <span className={`status-pill ${statusClass(currentProject.status)}`}>{currentProject.status || 'Active'}</span>
            <span className="env-pill">{currentProject.environment || 'QA'}</span>
            {currentProject.product && <span className="product-badge">{currentProject.product}</span>}
          </div>
          <h1>{currentProject.name}</h1>
          <p>{currentProject.description || 'No project description provided.'}</p>
          <div className="banner-team">
            <span><strong>Manager:</strong> {currentProject.manager || 'Unassigned'}</span>
            <span>•</span>
            <span><strong>QA Lead:</strong> {currentProject.qa_lead || 'Unassigned'}</span>
            {currentProject.target_release_date && (
              <>
                <span>•</span>
                <span><strong>Target Release:</strong> {currentProject.target_release_date}</span>
              </>
            )}
          </div>
        </div>

        <div className="banner-metrics">
          <div className="b-metric">
            <span>Pass Rate</span>
            <strong>{stats.passRate}%</strong>
          </div>
          <div className="b-metric">
            <span>Req Coverage</span>
            <strong>{stats.coverage}%</strong>
          </div>
          <div className="b-metric">
            <span>Test Cases</span>
            <strong>{stats.totalCases}</strong>
          </div>
          <div className="b-metric">
            <span>Open Defects</span>
            <strong className={stats.openDefects > 0 ? 'text-coral' : ''}>{stats.openDefects}</strong>
          </div>
        </div>
      </div>

      {/* Quick Action Toolbar inside Project */}
      <div className="project-quick-toolbar">
        <span className="qt-label">QUICK ACTIONS:</span>
        <button
          className="button button-primary"
          onClick={() => openModal('plan', { project_id: currentProject.id })}
        >
          <Plus size={14} /> New Test Plan
        </button>
        <button
          className="button button-primary"
          onClick={() => openModal('suite', { project_id: currentProject.id })}
        >
          <Plus size={14} /> New Test Suite
        </button>
        <button
          className="button button-primary"
          onClick={() => openModal('case', { project_id: currentProject.id })}
        >
          <Plus size={14} /> New Test Case
        </button>
        <button
          className="button button-primary"
          onClick={() => openModal('run', { project_id: currentProject.id })}
        >
          <Plus size={14} /> New Test Run
        </button>
        <button
          className="button button-quiet"
          onClick={() => openModal('requirement', { project_id: currentProject.id })}
        >
          <Plus size={14} /> New Requirement
        </button>
        <button
          className="button button-quiet"
          onClick={() => openModal('defect', { project_id: currentProject.id })}
        >
          <Plus size={14} /> New Defect
        </button>
      </div>

      {/* Tabs */}
      <div className="project-nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'tree' ? 'active' : ''}`}
          onClick={() => setActiveTab('tree')}
        >
          <GitBranch size={15} />
          <strong>Hierarchy Tree</strong>
          <span className="tab-pill">Core</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'plans' ? 'active' : ''}`}
          onClick={() => setActiveTab('plans')}
        >
          <ClipboardList size={15} />
          <span>Test Plans</span>
          <span className="tab-count">{plans.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'runs' ? 'active' : ''}`}
          onClick={() => setActiveTab('runs')}
        >
          <Play size={15} />
          <span>Test Runs & Executions</span>
          <span className="tab-count">{runs.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'requirements' ? 'active' : ''}`}
          onClick={() => setActiveTab('requirements')}
        >
          <CircleCheck size={15} />
          <span>Requirements</span>
          <span className="tab-count">{requirements.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'defects' ? 'active' : ''}`}
          onClick={() => setActiveTab('defects')}
        >
          <Bug size={15} />
          <span>Defects</span>
          <span className={`tab-count ${stats.openDefects > 0 ? 'count-alert' : ''}`}>
            {stats.openDefects}
          </span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'traceability' ? 'active' : ''}`}
          onClick={() => setActiveTab('traceability')}
        >
          <Activity size={15} />
          <span>Traceability Flow</span>
          <span className="tab-pill pill-lime">{stats.coverage}%</span>
        </button>
      </div>

      {/* TAB CONTENT */}
      <div className="project-tab-pane">
        {/* ================================================================= */}
        {/* TAB 1: HIERARCHY TREE                                             */}
        {/* ================================================================= */}
        {activeTab === 'tree' && (
          <div className="hierarchy-tree-layout">
            <div className="tree-explorer-panel">
              <div className="tree-controls">
                <div className="tree-legend">
                  <span>Structure:</span>
                  <b>PROJECT</b> → <b>TEST PLAN</b> → <b>TEST SUITE</b> → <b>TEST CASES</b> & <b>TEST RUNS</b> → <b>EXECUTIONS</b>
                </div>
                <div className="tree-action-buttons">
                  <button
                    className="button button-quiet btn-compact"
                    onClick={() => {
                      const allKeys = {};
                      plans.forEach((p) => {
                        allKeys[p.id] = true;
                        suites.filter((s) => s.plan_id === p.id).forEach((s) => {
                          allKeys[s.id] = true;
                        });
                        runs.filter((r) => r.plan_id === p.id).forEach((r) => {
                          allKeys[r.id] = true;
                        });
                      });
                      allKeys.requirements = true;
                      allKeys.defects = true;
                      setTreeExpanded(allKeys);
                    }}
                  >
                    Expand All
                  </button>
                  <button
                    className="button button-quiet btn-compact"
                    onClick={() => setTreeExpanded({})}
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* Tree view */}
              <div className="tree-scroll-area">
                {/* ROOT: Project Node */}
                <div className="tree-root-item">
                  <div
                    className={`tree-node node-project ${selectedTreeNode?.type === 'project' ? 'selected' : ''}`}
                    onClick={() => setSelectedTreeNode({ type: 'project', item: currentProject })}
                  >
                    <FolderKanban size={17} className="node-icon text-green" />
                    <span className="node-label">PROJECT: <strong>{currentProject.name}</strong></span>
                    <span className="record-id">{currentProject.id}</span>
                  </div>

                  {/* BRANCH 1: TEST PLANS */}
                  <div className="tree-branch">
                    <div className="tree-branch-header" onClick={() => toggleTree('plans')}>
                      <button className="tree-expander">
                        {treeExpanded.plans ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <ClipboardList size={15} className="text-lime" />
                      <span className="branch-title">TEST PLANS ({plans.length})</span>
                      <button
                        className="node-quick-add"
                        title="Add Test Plan"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal('plan', { project_id: currentProject.id });
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {treeExpanded.plans && (
                      <div className="tree-children">
                        {plans.length === 0 ? (
                          <div className="tree-empty-notice">
                            No Test Plans created yet. Click "+" to create one.
                          </div>
                        ) : (
                          plans.map((plan) => {
                            const planSuites = suites.filter((s) => s.plan_id === plan.id);
                            const planRuns = runs.filter((r) => r.plan_id === plan.id);
                            const isPlanExpanded = treeExpanded[plan.id];

                            return (
                              <div key={plan.id} className="tree-plan-block">
                                <div
                                  className={`tree-node node-plan ${selectedTreeNode?.item?.id === plan.id ? 'selected' : ''}`}
                                  onClick={() => setSelectedTreeNode({ type: 'plan', item: plan })}
                                >
                                  <button
                                    className="tree-expander"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTree(plan.id);
                                    }}
                                  >
                                    {isPlanExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                  </button>
                                  <ClipboardList size={14} />
                                  <span className="node-label">
                                    <strong>{plan.name}</strong>
                                    <small className="record-id">{plan.id}</small>
                                  </span>
                                  <span className={`status-pill ${statusClass(plan.status)}`}>{plan.status}</span>
                                  <div className="node-hover-actions" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      title="Add Suite to this Plan"
                                      onClick={() => openModal('suite', { project_id: currentProject.id, plan_id: plan.id })}
                                    >
                                      +Suite
                                    </button>
                                    <button
                                      title="Add Run for this Plan"
                                      onClick={() => openModal('run', { project_id: currentProject.id, plan_id: plan.id })}
                                    >
                                      +Run
                                    </button>
                                  </div>
                                </div>

                                {isPlanExpanded && (
                                  <div className="tree-sub-branch">
                                    {/* SUB-BRANCH: TEST SUITES */}
                                    <div className="tree-sub-header">
                                      <Layers size={13} />
                                      <span>Test Suites ({planSuites.length})</span>
                                      <button
                                        className="node-quick-add"
                                        title="Add Suite"
                                        onClick={() => openModal('suite', { project_id: currentProject.id, plan_id: plan.id })}
                                      >
                                        <Plus size={11} />
                                      </button>
                                    </div>

                                    <div className="tree-suites-list">
                                      {planSuites.length === 0 ? (
                                        <div className="tree-empty-hint">No suites in this plan. Click "+" to add.</div>
                                      ) : (
                                        planSuites.map((suite) => {
                                          const suiteCases = cases.filter((c) => c.suite_id === suite.id);
                                          const isSuiteExpanded = treeExpanded[suite.id];

                                          return (
                                            <div key={suite.id} className="tree-suite-block">
                                              <div
                                                className={`tree-node node-suite ${selectedTreeNode?.item?.id === suite.id ? 'selected' : ''}`}
                                                onClick={() => setSelectedTreeNode({ type: 'suite', item: suite, plan })}
                                              >
                                                <button
                                                  className="tree-expander"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleTree(suite.id);
                                                  }}
                                                >
                                                  {isSuiteExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                </button>
                                                <Layers size={13} />
                                                <span className="node-label">
                                                  <strong>{suite.name}</strong>
                                                  <small className="record-id">{suite.id}</small>
                                                </span>
                                                <span className="count-pill">{suiteCases.length} cases</span>
                                                <div className="node-hover-actions" onClick={(e) => e.stopPropagation()}>
                                                  <button
                                                    title="Add Case to Suite"
                                                    onClick={() => openModal('case', { project_id: currentProject.id, plan_id: plan.id, suite_id: suite.id })}
                                                  >
                                                    +Case
                                                  </button>
                                                  <button
                                                    title="Run this Suite"
                                                    onClick={() => openModal('run', { project_id: currentProject.id, plan_id: plan.id, suite_id: suite.id })}
                                                  >
                                                    Run
                                                  </button>
                                                </div>
                                              </div>

                                              {/* TEST CASES under Suite */}
                                              {isSuiteExpanded && (
                                                <div className="tree-cases-list">
                                                  {suiteCases.length === 0 ? (
                                                    <div className="tree-empty-hint">No test cases in this suite.</div>
                                                  ) : (
                                                    suiteCases.map((tc) => {
                                                      const linkedReq = pick(requirements, tc.requirement_id);
                                                      return (
                                                        <div
                                                          key={tc.id}
                                                          className={`tree-node node-case ${selectedTreeNode?.item?.id === tc.id ? 'selected' : ''}`}
                                                          onClick={() => setSelectedTreeNode({ type: 'case', item: tc, suite, plan })}
                                                        >
                                                          <FileText size={13} />
                                                          <span className="node-label">
                                                            <strong className="record-id">{tc.id}</strong> {tc.title}
                                                          </span>
                                                          <span className={`status-pill ${statusClass(tc.priority)}`}>{tc.priority}</span>
                                                          {linkedReq && (
                                                            <span className="linked-req-pill" title={`Linked to ${linkedReq.name}`}>
                                                              {linkedReq.id}
                                                            </span>
                                                          )}
                                                        </div>
                                                      );
                                                    })
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>

                                    {/* SUB-BRANCH: TEST RUNS for this Plan */}
                                    <div className="tree-sub-header mt-8">
                                      <Play size={13} />
                                      <span>Test Runs ({planRuns.length})</span>
                                      <button
                                        className="node-quick-add"
                                        title="Add Test Run for this Plan"
                                        onClick={() => openModal('run', { project_id: currentProject.id, plan_id: plan.id })}
                                      >
                                        <Plus size={11} />
                                      </button>
                                    </div>

                                    <div className="tree-runs-list">
                                      {planRuns.length === 0 ? (
                                        <div className="tree-empty-hint">No runs created under this plan yet.</div>
                                      ) : (
                                        planRuns.map((run) => {
                                          const runExecs = executions.filter((e) => e.run_id === run.id);
                                          const isRunExpanded = treeExpanded[run.id];
                                          const passed = runExecs.filter((e) => e.status === 'Passed').length;
                                          const failed = runExecs.filter((e) => e.status === 'Failed').length;

                                          return (
                                            <div key={run.id} className="tree-run-block">
                                              <div
                                                className={`tree-node node-run ${selectedTreeNode?.item?.id === run.id ? 'selected' : ''}`}
                                                onClick={() => setSelectedTreeNode({ type: 'run', item: run, plan })}
                                              >
                                                <button
                                                  className="tree-expander"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleTree(run.id);
                                                  }}
                                                >
                                                  {isRunExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                </button>
                                                <Play size={13} />
                                                <span className="node-label">
                                                  <strong>{run.name}</strong>
                                                  <small className="record-id">{run.id}</small>
                                                </span>
                                                <span className={`status-pill ${statusClass(run.status)}`}>{run.status}</span>
                                                <span className="run-mini-stat">
                                                  {passed}P / {failed}F
                                                </span>
                                              </div>

                                              {/* EXECUTIONS under Run */}
                                              {isRunExpanded && (
                                                <div className="tree-executions-list">
                                                  {runExecs.length === 0 ? (
                                                    <div className="tree-empty-hint">No executions in this run.</div>
                                                  ) : (
                                                    runExecs.map((exec) => {
                                                      const testCase = exec.case_snapshot || pick(cases, exec.case_id);
                                                      const defect = defects.find((d) => d.execution_id === exec.id || d.case_id === exec.case_id);
                                                      return (
                                                        <div
                                                          key={exec.id}
                                                          className={`tree-node node-execution ${selectedTreeNode?.item?.id === exec.id ? 'selected' : ''}`}
                                                          onClick={() => setSelectedTreeNode({ type: 'execution', item: exec, run, testCase, defect })}
                                                        >
                                                          <ListChecks size={13} />
                                                          <span className="node-label">
                                                            <strong className="record-id">{exec.id}</strong> {testCase?.title || exec.case_id}
                                                          </span>
                                                          <span className={`status-pill ${statusClass(exec.status)}`}>{exec.status}</span>
                                                          {defect && (
                                                            <span className="linked-defect-pill" title={`Defect: ${defect.title}`}>
                                                              <Bug size={11} /> {defect.id}
                                                            </span>
                                                          )}
                                                        </div>
                                                      );
                                                    })
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* BRANCH 2: DIRECT / CROSS-SUITE TEST RUNS */}
                  <div className="tree-branch">
                    <div className="tree-branch-header" onClick={() => toggleTree('runs')}>
                      <button className="tree-expander">
                        {treeExpanded.runs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <Play size={15} className="text-blue" />
                      <span className="branch-title">ALL TEST RUNS ({runs.length})</span>
                      <button
                        className="node-quick-add"
                        title="Add Test Run"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal('run', { project_id: currentProject.id });
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {treeExpanded.runs && (
                      <div className="tree-children">
                        {runs.map((r) => {
                          const rExecs = executions.filter((e) => e.run_id === r.id);
                          const plan = pick(plans, r.plan_id);
                          return (
                            <div
                              key={r.id}
                              className={`tree-node node-run ${selectedTreeNode?.item?.id === r.id ? 'selected' : ''}`}
                              onClick={() => setSelectedTreeNode({ type: 'run', item: r, plan })}
                            >
                              <Play size={13} />
                              <span className="node-label">
                                <strong>{r.name}</strong>
                                <small className="record-id">{r.id}</small>
                                {plan && <small className="plan-tag">• {plan.name}</small>}
                              </span>
                              <span className={`status-pill ${statusClass(r.status)}`}>{r.status}</span>
                              <span className="count-pill">{rExecs.length} execs</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* BRANCH 3: REQUIREMENTS */}
                  <div className="tree-branch">
                    <div className="tree-branch-header" onClick={() => toggleTree('requirements')}>
                      <button className="tree-expander">
                        {treeExpanded.requirements ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <CircleCheck size={15} className="text-green" />
                      <span className="branch-title">REQUIREMENTS ({requirements.length})</span>
                      <button
                        className="node-quick-add"
                        title="Add Requirement"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal('requirement', { project_id: currentProject.id });
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {treeExpanded.requirements && (
                      <div className="tree-children">
                        {requirements.map((req) => {
                          const linked = cases.filter((c) => c.requirement_id === req.id);
                          return (
                            <div
                              key={req.id}
                              className={`tree-node node-requirement ${selectedTreeNode?.item?.id === req.id ? 'selected' : ''}`}
                              onClick={() => setSelectedTreeNode({ type: 'requirement', item: req })}
                            >
                              <CircleCheck size={13} />
                              <span className="node-label">
                                <strong className="record-id">{req.id}</strong> {req.name}
                              </span>
                              <span className={`status-pill ${linked.length ? 'passed' : 'failed'}`}>
                                {linked.length ? `${linked.length} cases` : 'Uncovered'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* BRANCH 4: DEFECTS */}
                  <div className="tree-branch">
                    <div className="tree-branch-header" onClick={() => toggleTree('defects')}>
                      <button className="tree-expander">
                        {treeExpanded.defects ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <Bug size={15} className="text-coral" />
                      <span className="branch-title">DEFECTS / ISSUES ({defects.length})</span>
                      <button
                        className="node-quick-add"
                        title="Add Defect"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal('defect', { project_id: currentProject.id });
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {treeExpanded.defects && (
                      <div className="tree-children">
                        {defects.map((bug) => (
                          <div
                            key={bug.id}
                            className={`tree-node node-defect ${selectedTreeNode?.item?.id === bug.id ? 'selected' : ''}`}
                            onClick={() => setSelectedTreeNode({ type: 'defect', item: bug })}
                          >
                            <Bug size={13} />
                            <span className="node-label">
                              <strong className="record-id">{bug.id}</strong> {bug.title}
                            </span>
                            <span className={`status-pill ${statusClass(bug.severity)}`}>{bug.severity}</span>
                            <span className={`status-pill ${statusClass(bug.status)}`}>{bug.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tree Inspector Panel */}
            <div className="tree-inspector-panel">
              {selectedTreeNode ? (
                <TreeInspector
                  node={selectedTreeNode}
                  project={currentProject}
                  data={data}
                  openModal={openModal}
                  handleDelete={handleDelete}
                  handleQuickExecStatus={handleQuickExecStatus}
                  onNavigate={onNavigate}
                  refresh={refresh}
                  announce={announce}
                  request={request}
                />
              ) : (
                <div className="inspector-placeholder">
                  <GitBranch size={32} />
                  <h3>Hierarchy Inspector</h3>
                  <p>Click any Project, Test Plan, Test Suite, Test Case, Test Run, Execution, Requirement, or Defect node in the tree to inspect details and perform actions.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: TEST PLANS                                                */}
        {/* ================================================================= */}
        {activeTab === 'plans' && (
          <div className="tab-section">
            <div className="tab-toolbar">
              <h3>Test Plans ({plans.length})</h3>
              <button
                className="button button-primary"
                onClick={() => openModal('plan', { project_id: currentProject.id })}
              >
                <Plus size={15} /> New Test Plan
              </button>
            </div>

            <div className="plans-grid">
              {plans.map((plan) => {
                const planSuites = suites.filter((s) => s.plan_id === plan.id);
                const planCases = cases.filter((c) => c.plan_id === plan.id);
                const planRuns = runs.filter((r) => r.plan_id === plan.id);

                return (
                  <div key={plan.id} className="plan-card">
                    <div className="plan-card-header">
                      <div className="p-header-left">
                        <span className="record-id">{plan.id}</span>
                        <span className={`status-pill ${statusClass(plan.status)}`}>{plan.status}</span>
                        <span className={`status-pill ${statusClass(plan.priority)}`}>{plan.priority}</span>
                      </div>
                      <div className="p-header-actions">
                        <button
                          className="icon-button"
                          onClick={() => openModal('plan_edit', { plan })}
                          title="Edit Plan"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="icon-button text-danger"
                          onClick={(e) => handleDelete('plans', plan.id, plan.name, e)}
                          title="Delete Plan"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <h4>{plan.name}</h4>
                    <p className="plan-card-desc">{plan.description || plan.scope || 'No description.'}</p>

                    <div className="plan-card-meta">
                      <div>
                        <span>LEAD</span>
                        <strong>{plan.lead || 'Unassigned'}</strong>
                      </div>
                      <div>
                        <span>TIMEFRAME</span>
                        <strong>{plan.start_date || '—'} to {plan.end_date || '—'}</strong>
                      </div>
                    </div>

                    <div className="plan-card-counters">
                      <div>
                        <Layers size={13} />
                        <strong>{planSuites.length}</strong> Suites
                      </div>
                      <div>
                        <FileText size={13} />
                        <strong>{planCases.length}</strong> Cases
                      </div>
                      <div>
                        <Play size={13} />
                        <strong>{planRuns.length}</strong> Runs
                      </div>
                    </div>

                    <div className="plan-card-footer">
                      <button
                        className="button button-quiet btn-compact"
                        onClick={() => openModal('suite', { project_id: currentProject.id, plan_id: plan.id })}
                      >
                        <Plus size={13} /> Add Suite
                      </button>
                      <button
                        className="button button-quiet btn-compact"
                        onClick={() => openModal('run', { project_id: currentProject.id, plan_id: plan.id })}
                      >
                        <Plus size={13} /> Add Run
                      </button>
                      <button
                        className="button button-quiet btn-compact"
                        onClick={() => {
                          setActiveTab('tree');
                          setSelectedTreeNode({ type: 'plan', item: plan });
                          toggleTree(plan.id);
                        }}
                      >
                        Inspect in Tree →
                      </button>
                    </div>
                  </div>
                );
              })}
              {plans.length === 0 && (
                <div className="empty-state large-empty">
                  <ClipboardList size={28} />
                  <strong>No Test Plans in this Project</strong>
                  <span>Create your first test plan to organize test suites and runs.</span>
                  <button
                    className="button button-primary mt-12"
                    onClick={() => openModal('plan', { project_id: currentProject.id })}
                  >
                    <Plus size={14} /> Create Test Plan
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: TEST RUNS & EXECUTIONS (Flexible Selection Architecture)  */}
        {/* ================================================================= */}
        {activeTab === 'runs' && (
          <div className="tab-section">
            <div className="flexible-arch-callout">
              <div className="callout-icon">
                <Sparkles size={18} />
              </div>
              <div className="callout-copy">
                <strong>Flexible Test Execution Architecture</strong>
                <p>Test Runs can be associated with a Test Plan or run ad-hoc. Runs can select and execute test cases from multiple suites, supporting regression, smoke, sanity, and ad-hoc runs.</p>
              </div>
              <button
                className="button button-primary"
                onClick={() => openModal('run', { project_id: currentProject.id })}
              >
                <Plus size={15} /> Create Test Run
              </button>
            </div>

            <div className="runs-list">
              {runs.map((run) => {
                const runExecs = executions.filter((e) => e.run_id === run.id);
                const passed = runExecs.filter((e) => e.status === 'Passed').length;
                const failed = runExecs.filter((e) => e.status === 'Failed').length;
                const blocked = runExecs.filter((e) => e.status === 'Blocked').length;
                const notRun = runExecs.filter((e) => e.status === 'Not Run').length;
                const prog = percentage(runExecs.length - notRun, runExecs.length);
                const plan = pick(plans, run.plan_id);

                return (
                  <div key={run.id} className="run-card-full">
                    <div className="run-card-topbar">
                      <div className="run-topbar-left">
                        <span className="record-id">{run.id}</span>
                        <h4>{run.name}</h4>
                        <span className={`status-pill ${statusClass(run.status)}`}>{run.status}</span>
                        {plan && <span className="plan-badge">Plan: {plan.name}</span>}
                      </div>
                      <div className="run-topbar-right">
                        <span className="env-pill">{run.environment || 'QA'}</span>
                        {run.build && <span className="build-pill">Build: {run.build}</span>}
                        <button
                          className="button button-primary btn-compact"
                          onClick={() => onNavigate('Test Execution')}
                          title="Open in Test Execution Workspace"
                        >
                          <Play size={13} /> Launch Workspace
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => openModal('run_edit', { run })}
                          title="Edit Run"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="icon-button text-danger"
                          onClick={(e) => handleDelete('runs', run.id, run.name, e)}
                          title="Delete Run"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Progress strip */}
                    <div className="run-progress-strip">
                      <div className="run-progress-bar">
                        <div className="track-passed" style={{ width: `${percentage(passed, runExecs.length)}%` }} />
                        <div className="track-failed" style={{ width: `${percentage(failed, runExecs.length)}%` }} />
                        <div className="track-blocked" style={{ width: `${percentage(blocked, runExecs.length)}%` }} />
                      </div>
                      <div className="run-progress-meta">
                        <span>Progress: <strong>{prog}%</strong> ({runExecs.length - notRun}/{runExecs.length} tests)</span>
                        <div className="run-legend-inline">
                          <span className="text-green">● {passed} Passed</span>
                          <span className="text-coral">● {failed} Failed</span>
                          <span className="text-amber">● {blocked} Blocked</span>
                          <span>● {notRun} Not Run</span>
                        </div>
                      </div>
                    </div>

                    {/* Executions Table */}
                    <div className="run-executions-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Execution ID</th>
                            <th>Test Case</th>
                            <th>Suite</th>
                            <th>Priority</th>
                            <th>Status</th>
                            <th>Outcome Action</th>
                            <th>Defect</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runExecs.map((exec) => {
                            const tc = exec.case_snapshot || pick(cases, exec.case_id);
                            const suite = pick(suites, tc?.suite_id);
                            const defect = defects.find((d) => d.execution_id === exec.id || d.case_id === exec.case_id);

                            return (
                              <tr key={exec.id}>
                                <td><span className="record-id">{exec.id}</span></td>
                                <td>
                                  <strong>{tc?.id}</strong> {tc?.title || 'Unknown case'}
                                </td>
                                <td>{suite?.name || '—'}</td>
                                <td><span className={`status-pill ${statusClass(tc?.priority)}`}>{tc?.priority || 'Medium'}</span></td>
                                <td><span className={`status-pill ${statusClass(exec.status)}`}>{exec.status}</span></td>
                                <td>
                                  <div className="quick-status-buttons">
                                    <button
                                      className={`qs-btn passed ${exec.status === 'Passed' ? 'active' : ''}`}
                                      onClick={() => handleQuickExecStatus(exec.id, 'Passed')}
                                      title="Mark Passed"
                                    >
                                      <Check size={11} /> Pass
                                    </button>
                                    <button
                                      className={`qs-btn failed ${exec.status === 'Failed' ? 'active' : ''}`}
                                      onClick={() => handleQuickExecStatus(exec.id, 'Failed')}
                                      title="Mark Failed"
                                    >
                                      <X size={11} /> Fail
                                    </button>
                                    <button
                                      className={`qs-btn blocked ${exec.status === 'Blocked' ? 'active' : ''}`}
                                      onClick={() => handleQuickExecStatus(exec.id, 'Blocked')}
                                      title="Mark Blocked"
                                    >
                                      Block
                                    </button>
                                  </div>
                                </td>
                                <td>
                                  {exec.status === 'Failed' && (
                                    defect ? (
                                      <span className="linked-defect-tag" title={defect.title}>
                                        <Bug size={11} /> {defect.id}
                                      </span>
                                    ) : (
                                      <button
                                        className="button button-danger btn-compact"
                                        onClick={() => openModal('defect', { execution: exec, project_id: currentProject.id })}
                                      >
                                        <Bug size={12} /> Log Defect
                                      </button>
                                    )
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {runs.length === 0 && (
                <div className="empty-state large-empty">
                  <Play size={28} />
                  <strong>No Test Runs created in this project</strong>
                  <span>Create a test run to execute cases from suites or plans.</span>
                  <button
                    className="button button-primary mt-12"
                    onClick={() => openModal('run', { project_id: currentProject.id })}
                  >
                    <Plus size={14} /> Create Test Run
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: REQUIREMENTS                                               */}
        {/* ================================================================= */}
        {activeTab === 'requirements' && (
          <div className="tab-section">
            <div className="tab-toolbar">
              <div>
                <h3>Project Requirements ({requirements.length})</h3>
                <p className="tab-subtext">Requirements connect business rules to test cases, runs, and execution outcomes.</p>
              </div>
              <button
                className="button button-primary"
                onClick={() => openModal('requirement', { project_id: currentProject.id })}
              >
                <Plus size={15} /> New Requirement
              </button>
            </div>

            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Requirement Name</th>
                    <th>Feature Area</th>
                    <th>Priority</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Linked Test Cases</th>
                    <th>Coverage</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((req) => {
                    const linked = cases.filter((c) => c.requirement_id === req.id);
                    const isCovered = linked.length > 0;

                    return (
                      <tr key={req.id}>
                        <td><span className="record-id">{req.id}</span></td>
                        <td>
                          <strong>{req.name}</strong>
                          {req.description && <p className="table-row-desc">{req.description}</p>}
                        </td>
                        <td>{req.feature || '—'}</td>
                        <td><span className={`status-pill ${statusClass(req.priority)}`}>{req.priority}</span></td>
                        <td>{req.source || '—'}</td>
                        <td><span className={`status-pill ${statusClass(req.status)}`}>{req.status}</span></td>
                        <td>
                          {linked.length > 0 ? (
                            <div className="linked-cases-chips">
                              {linked.map((c) => (
                                <span key={c.id} className="case-chip" title={c.title}>
                                  {c.id}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill ${isCovered ? 'covered' : 'failed'}`}>
                            {isCovered ? `${linked.length} covered` : 'Uncovered'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="table-actions-cell">
                            <button
                              className="button button-quiet btn-compact"
                              onClick={() => openModal('case', { project_id: currentProject.id, requirement_id: req.id })}
                              title="Add Test Case for this Requirement"
                            >
                              + Test Case
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => openModal('requirement_edit', { requirement: req })}
                              title="Edit Requirement"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              className="icon-button text-danger"
                              onClick={(e) => handleDelete('requirements', req.id, req.name, e)}
                              title="Delete Requirement"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {requirements.length === 0 && (
                <div className="empty-state">
                  <CircleCheck size={26} />
                  <strong>No requirements recorded yet</strong>
                  <span>Create requirements to start building your traceability matrix.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: DEFECTS / ISSUES                                           */}
        {/* ================================================================= */}
        {activeTab === 'defects' && (
          <div className="tab-section">
            <div className="tab-toolbar">
              <div>
                <h3>Defects & Issues ({defects.length})</h3>
                <p className="tab-subtext">Issues linked to failed test runs, executions, and requirements.</p>
              </div>
              <button
                className="button button-primary"
                onClick={() => openModal('defect', { project_id: currentProject.id })}
              >
                <Plus size={15} /> New Defect
              </button>
            </div>

            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>Defect ID</th>
                    <th>Title</th>
                    <th>Linked Case</th>
                    <th>Linked Run</th>
                    <th>Severity</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Assigned Dev</th>
                    <th>Jira Key</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {defects.map((bug) => {
                    const testCase = pick(cases, bug.case_id);
                    const run = pick(runs, bug.run_id);

                    return (
                      <tr key={bug.id}>
                        <td><span className="record-id">{bug.id}</span></td>
                        <td>
                          <strong>{bug.title}</strong>
                          {bug.description && <p className="table-row-desc">{bug.description}</p>}
                        </td>
                        <td>
                          {testCase ? (
                            <span className="record-id" title={testCase.title}>{testCase.id}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {run ? (
                            <span className="record-id" title={run.name}>{run.id}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td><span className={`status-pill ${statusClass(bug.severity)}`}>{bug.severity}</span></td>
                        <td><span className={`status-pill ${statusClass(bug.priority)}`}>{bug.priority}</span></td>
                        <td>
                          <select
                            className="inline-status"
                            value={bug.status}
                            onChange={async (e) => {
                              try {
                                await request(`/defects/${encodeURIComponent(bug.id)}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: e.target.value }),
                                });
                                await refresh();
                                announce('Defect status updated');
                              } catch (err) {
                                announce(err.message);
                              }
                            }}
                          >
                            {['New', 'Open', 'In Progress', 'Fixed', 'Retest', 'Reopened', 'Closed', 'Rejected'].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td>{bug.assigned_developer || 'Unassigned'}</td>
                        <td>
                          {bug.jira_key ? (
                            <a
                              className="jira-link"
                              href={bug.external_issue_url || '#'}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {bug.jira_key} <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="table-actions-cell">
                            <button
                              className="icon-button"
                              onClick={() => openModal('defect_edit', { defect: bug })}
                              title="Edit Defect"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              className="icon-button text-danger"
                              onClick={(e) => handleDelete('defects', bug.id, bug.title, e)}
                              title="Delete Defect"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {defects.length === 0 && (
                <div className="empty-state">
                  <Bug size={26} />
                  <strong>No defects logged in this project</strong>
                  <span>Great job! Any failed executions will suggest logging a defect.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: TRACEABILITY FLOW (Requirement -> Case -> Run -> Exec -> Bug)*/}
        {/* ================================================================= */}
        {activeTab === 'traceability' && (
          <div className="tab-section">
            <div className="traceability-showcase-header">
              <div>
                <h3>End-to-End Quality Traceability</h3>
                <p className="tab-subtext">
                  Traces the complete lifecycle: <strong>Requirement</strong> → <strong>Test Case</strong> → <strong>Test Run</strong> → <strong>Execution Result</strong> → <strong>Defect</strong>
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="button button-quiet"
                  onClick={handleExportTraceability}
                >
                  <Download size={14} /> Export Traceability Matrix
                </button>
              </div>
            </div>

            {/* Prompt's Example Flow Card */}
            <div className="traceability-example-banner">
              <span className="example-badge">REAL-WORLD TRACEABILITY PIPELINE</span>
              <div className="flow-step-chain">
                <div className="flow-card-node">
                  <div className="flow-node-tag text-green"><CircleCheck size={13} /> REQUIREMENT</div>
                  <strong className="flow-node-id">REQ-001</strong>
                  <p className="flow-node-text">"Secure customer sign-in"</p>
                </div>

                <div className="flow-arrow">
                  <ArrowRight size={18} />
                </div>

                <div className="flow-card-node">
                  <div className="flow-node-tag text-blue"><FileText size={13} /> TEST CASE</div>
                  <strong className="flow-node-id">TC-001</strong>
                  <p className="flow-node-text">"Sign in with valid credentials"</p>
                </div>

                <div className="flow-arrow">
                  <ArrowRight size={18} />
                </div>

                <div className="flow-card-node">
                  <div className="flow-node-tag text-purple"><Play size={13} /> TEST RUN</div>
                  <strong className="flow-node-id">RUN-001</strong>
                  <p className="flow-node-text">"Regression Testing - Sprint 24"</p>
                </div>

                <div className="flow-arrow">
                  <ArrowRight size={18} />
                </div>

                <div className="flow-card-node">
                  <div className="flow-node-tag text-coral"><ListChecks size={13} /> EXECUTION</div>
                  <strong className="flow-node-id">EXEC-003</strong>
                  <span className="status-pill failed">FAILED</span>
                </div>

                <div className="flow-arrow">
                  <ArrowRight size={18} />
                </div>

                <div className="flow-card-node">
                  <div className="flow-node-tag text-red"><Bug size={13} /> DEFECT</div>
                  <strong className="flow-node-id">BUG-001</strong>
                  <p className="flow-node-text">"Login accepts expired reset token"</p>
                </div>
              </div>
            </div>

            {/* Interactive Traceability Matrix */}
            <div className="traceability-matrix-panel">
              <div className="matrix-filters">
                <label className="filter-select">
                  <span>FILTER REQUIREMENT</span>
                  <select value={traceFilterReq} onChange={(e) => setTraceFilterReq(e.target.value)}>
                    <option value="All">All Requirements ({requirements.length})</option>
                    {requirements.map((r) => (
                      <option key={r.id} value={r.id}>{r.id}: {r.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>

                <label className="filter-select">
                  <span>FILTER STATUS</span>
                  <select value={traceFilterStatus} onChange={(e) => setTraceFilterStatus(e.target.value)}>
                    <option value="All">All Execution Statuses</option>
                    <option value="Passed">Passed</option>
                    <option value="Failed">Failed</option>
                    <option value="Blocked">Blocked</option>
                    <option value="Not Run">Not Run</option>
                    <option value="Uncovered">Uncovered Only</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
              </div>

              <div className="table-panel">
                <table className="trace-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Requirement</th>
                      <th style={{ width: '22%' }}>Test Case</th>
                      <th style={{ width: '20%' }}>Test Run</th>
                      <th style={{ width: '16%' }}>Execution Status</th>
                      <th style={{ width: '20%' }}>Linked Defect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements
                      .filter((req) => traceFilterReq === 'All' || req.id === traceFilterReq)
                      .flatMap((req) => {
                        const linkedCases = cases.filter((c) => c.requirement_id === req.id);
                        if (!linkedCases.length) {
                          if (traceFilterStatus !== 'All' && traceFilterStatus !== 'Uncovered') return [];
                          return [
                            <tr key={`req-${req.id}-uncovered`} className="row-uncovered">
                              <td>
                                <strong className="record-id">{req.id}</strong> {req.name}
                              </td>
                              <td colSpan={4}>
                                <div className="uncovered-notice">
                                  <AlertCircle size={14} />
                                  <span>Coverage Gap: No test cases verify this requirement.</span>
                                  <button
                                    className="button button-quiet btn-compact"
                                    onClick={() => openModal('case', { project_id: currentProject.id, requirement_id: req.id })}
                                  >
                                    + Add Test Case
                                  </button>
                                </div>
                              </td>
                            </tr>,
                          ];
                        }

                        return linkedCases.flatMap((tc) => {
                          const execs = executions.filter((e) => e.case_id === tc.id);
                          if (!execs.length) {
                            if (traceFilterStatus !== 'All' && traceFilterStatus !== 'Not Run') return [];
                            return [
                              <tr key={`tc-${tc.id}-noexec`}>
                                <td>
                                  <span className="record-id">{req.id}</span> {req.name}
                                </td>
                                <td>
                                  <strong className="record-id">{tc.id}</strong> {tc.title}
                                </td>
                                <td><span className="text-muted">Not scheduled in run</span></td>
                                <td><span className="status-pill not-run">Not Run</span></td>
                                <td><span className="text-muted">—</span></td>
                              </tr>,
                            ];
                          }

                          return execs
                            .filter((exec) => traceFilterStatus === 'All' || exec.status === traceFilterStatus)
                            .map((exec) => {
                              const run = pick(runs, exec.run_id);
                              const defect = defects.find((d) => d.execution_id === exec.id || d.case_id === tc.id);

                              return (
                                <tr key={`exec-${exec.id}`}>
                                  <td>
                                    <span className="record-id">{req.id}</span> {req.name}
                                  </td>
                                  <td>
                                    <strong className="record-id">{tc.id}</strong> {tc.title}
                                  </td>
                                  <td>
                                    <span className="record-id">{run?.id || exec.run_id}</span> {run?.name || 'Run'}
                                  </td>
                                  <td>
                                    <span className={`status-pill ${statusClass(exec.status)}`}>
                                      {exec.status}
                                    </span>
                                  </td>
                                  <td>
                                    {defect ? (
                                      <div className="trace-defect-cell">
                                        <Bug size={13} className="text-coral" />
                                        <strong>{defect.id}:</strong> {defect.title}
                                      </div>
                                    ) : exec.status === 'Failed' ? (
                                      <button
                                        className="button button-danger btn-compact"
                                        onClick={() => openModal('defect', { execution: exec, project_id: currentProject.id })}
                                      >
                                        <Bug size={12} /> Log Defect
                                      </button>
                                    ) : (
                                      <span className="text-muted">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                        });
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// TREE INSPECTOR COMPONENT (Right-side detail panel in Tree View)
// ----------------------------------------------------------------------------
function TreeInspector({
  node,
  project,
  data,
  openModal,
  handleDelete,
  handleQuickExecStatus,
  onNavigate,
  refresh,
  announce,
  request,
}) {
  const { type, item } = node;

  if (type === 'project') {
    return (
      <div className="inspector-content">
        <div className="inspector-head">
          <FolderKanban size={20} className="text-green" />
          <div>
            <span className="record-id">{item.id}</span>
            <h3>{item.name}</h3>
          </div>
        </div>
        <div className="inspector-fields">
          <div><span>Product</span><strong>{item.product || '—'}</strong></div>
          <div><span>Status</span><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></div>
          <div><span>Environment</span><span className="env-pill">{item.environment || 'QA'}</span></div>
          <div><span>Manager</span><strong>{item.manager || '—'}</strong></div>
          <div><span>QA Lead</span><strong>{item.qa_lead || '—'}</strong></div>
          <div><span>Target Date</span><strong>{item.target_release_date || '—'}</strong></div>
          <div className="wide"><span>Description</span><p>{item.description || 'No description.'}</p></div>
        </div>
        <div className="inspector-actions">
          <button className="button button-primary" onClick={() => openModal('project_edit', { project: item })}>
            <Edit2 size={13} /> Edit Project
          </button>
        </div>
      </div>
    );
  }

  if (type === 'plan') {
    const planSuites = data.suites.filter((s) => s.plan_id === item.id);
    const planRuns = data.runs.filter((r) => r.plan_id === item.id);

    return (
      <div className="inspector-content">
        <div className="inspector-head">
          <ClipboardList size={20} className="text-lime" />
          <div>
            <span className="record-id">{item.id}</span>
            <h3>{item.name}</h3>
          </div>
        </div>
        <div className="inspector-fields">
          <div><span>Status</span><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></div>
          <div><span>Priority</span><span className={`status-pill ${statusClass(item.priority)}`}>{item.priority}</span></div>
          <div><span>Lead</span><strong>{item.lead || '—'}</strong></div>
          <div><span>Environment</span><strong>{item.environment || 'QA'}</strong></div>
          <div><span>Start Date</span><strong>{item.start_date || '—'}</strong></div>
          <div><span>End Date</span><strong>{item.end_date || '—'}</strong></div>
          <div className="wide"><span>Testing Scope</span><p>{item.scope || 'No scope described.'}</p></div>
          <div className="wide"><span>Strategy</span><p>{item.strategy || 'No strategy described.'}</p></div>
        </div>
        <div className="inspector-actions">
          <button className="button button-primary" onClick={() => openModal('suite', { project_id: project.id, plan_id: item.id })}>
            <Plus size={13} /> Add Suite
          </button>
          <button className="button button-primary" onClick={() => openModal('run', { project_id: project.id, plan_id: item.id })}>
            <Plus size={13} /> Add Run
          </button>
          <button className="button button-quiet" onClick={() => openModal('plan_edit', { plan: item })}>
            <Edit2 size={13} /> Edit
          </button>
          <button className="button button-danger" onClick={(e) => handleDelete('plans', item.id, item.name, e)}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    );
  }

  if (type === 'suite') {
    const suiteCases = data.cases.filter((c) => c.suite_id === item.id);

    return (
      <div className="inspector-content">
        <div className="inspector-head">
          <Layers size={20} className="text-blue" />
          <div>
            <span className="record-id">{item.id}</span>
            <h3>{item.name}</h3>
          </div>
        </div>
        <div className="inspector-fields">
          <div><span>Owner</span><strong>{item.owner || '—'}</strong></div>
          <div><span>Test Cases</span><strong>{suiteCases.length} cases</strong></div>
          <div className="wide"><span>Description</span><p>{item.description || 'No description.'}</p></div>
        </div>
        <div className="inspector-actions">
          <button className="button button-primary" onClick={() => openModal('case', { project_id: project.id, plan_id: item.plan_id, suite_id: item.id })}>
            <Plus size={13} /> Add Case
          </button>
          <button className="button button-quiet" onClick={() => openModal('run', { project_id: project.id, plan_id: item.plan_id, suite_id: item.id })}>
            <Play size={13} /> Run Suite
          </button>
          <button className="button button-quiet" onClick={() => openModal('suite_edit', { suite: item })}>
            <Edit2 size={13} /> Edit
          </button>
          <button className="button button-danger" onClick={(e) => handleDelete('suites', item.id, item.name, e)}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    );
  }

  if (type === 'case') {
    const steps = data.steps.filter((s) => s.case_id === item.id);
    const req = pick(data.requirements, item.requirement_id);

    return (
      <div className="inspector-content">
        <div className="inspector-head">
          <FileText size={20} className="text-green" />
          <div>
            <span className="record-id">{item.id}</span>
            <h3>{item.title}</h3>
          </div>
        </div>
        <div className="inspector-fields">
          <div><span>Priority</span><span className={`status-pill ${statusClass(item.priority)}`}>{item.priority}</span></div>
          <div><span>Test Type</span><span className="env-pill">{item.test_type || 'Functional'}</span></div>
          <div><span>Automation</span><span className={`status-pill ${statusClass(item.automation_status)}`}>{item.automation_status || 'Manual'}</span></div>
          <div><span>Status</span><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></div>
          {req && (
            <div className="wide">
              <span>Linked Requirement</span>
              <strong>{req.id}: {req.name}</strong>
            </div>
          )}
          {item.preconditions && (
            <div className="wide">
              <span>Preconditions</span>
              <p>{item.preconditions}</p>
            </div>
          )}
        </div>

        {/* Steps List */}
        <div className="inspector-steps-block">
          <h4>Test Steps ({steps.length})</h4>
          <div className="mini-step-list">
            {steps.map((st) => (
              <div key={st.id} className="mini-step-row">
                <span className="step-idx">{st.step_number}</span>
                <div className="step-body">
                  <strong>{st.action}</strong>
                  <small>Expected: {st.expected_result}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="inspector-actions">
          <button className="button button-primary" onClick={() => openModal('case_edit', { testCase: item })}>
            <Edit2 size={13} /> Edit Case
          </button>
          <button className="button button-danger" onClick={(e) => handleDelete('cases', item.id, item.title, e)}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    );
  }

  if (type === 'run') {
    const runExecs = data.executions.filter((e) => e.run_id === item.id);

    return (
      <div className="inspector-content">
        <div className="inspector-head">
          <Play size={20} className="text-purple" />
          <div>
            <span className="record-id">{item.id}</span>
            <h3>{item.name}</h3>
          </div>
        </div>
        <div className="inspector-fields">
          <div><span>Status</span><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></div>
          <div><span>Environment</span><span className="env-pill">{item.environment || 'QA'}</span></div>
          <div><span>Build</span><strong>{item.build || '—'}</strong></div>
          <div><span>Assigned To</span><strong>{item.assigned_to || 'Unassigned'}</strong></div>
          <div><span>Test Count</span><strong>{runExecs.length} executions</strong></div>
        </div>
        <div className="inspector-actions">
          <button className="button button-primary" onClick={() => onNavigate('Test Execution')}>
            <Play size={13} /> Open in Execution Workspace
          </button>
          <button className="button button-quiet" onClick={() => openModal('run_edit', { run: item })}>
            <Edit2 size={13} /> Edit Run
          </button>
          <button className="button button-danger" onClick={(e) => handleDelete('runs', item.id, item.name, e)}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    );
  }

  if (type === 'execution') {
    const { run, testCase, defect } = node;

    return (
      <div className="inspector-content">
        <div className="inspector-head">
          <ListChecks size={20} className="text-blue" />
          <div>
            <span className="record-id">{item.id}</span>
            <h3>{testCase?.title || 'Execution'}</h3>
          </div>
        </div>
        <div className="inspector-fields">
          <div><span>Status</span><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></div>
          <div><span>Run</span><strong>{run?.name || item.run_id}</strong></div>
          <div><span>Tester</span><strong>{item.tester || '—'}</strong></div>
          {item.actual_result && (
            <div className="wide"><span>Actual Result</span><p>{item.actual_result}</p></div>
          )}
          {defect && (
            <div className="wide">
              <span>Linked Defect</span>
              <strong className="text-coral"><Bug size={12} /> {defect.id}: {defect.title}</strong>
            </div>
          )}
        </div>
        <div className="inspector-actions">
          <button className="button button-quiet" onClick={() => handleQuickExecStatus(item.id, 'Passed')}>
            <Check size={13} /> Mark Passed
          </button>
          <button className="button button-quiet" onClick={() => handleQuickExecStatus(item.id, 'Failed')}>
            <X size={13} /> Mark Failed
          </button>
          {item.status === 'Failed' && !defect && (
            <button className="button button-danger" onClick={() => openModal('defect', { execution: item, project_id: project.id })}>
              <Bug size={13} /> Log Defect
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'requirement') {
    const linked = data.cases.filter((c) => c.requirement_id === item.id);

    return (
      <div className="inspector-content">
        <div className="inspector-head">
          <CircleCheck size={20} className="text-green" />
          <div>
            <span className="record-id">{item.id}</span>
            <h3>{item.name}</h3>
          </div>
        </div>
        <div className="inspector-fields">
          <div><span>Priority</span><span className={`status-pill ${statusClass(item.priority)}`}>{item.priority}</span></div>
          <div><span>Status</span><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></div>
          <div><span>Feature</span><strong>{item.feature || '—'}</strong></div>
          <div><span>Source</span><strong>{item.source || '—'}</strong></div>
          <div className="wide"><span>Description</span><p>{item.description || 'No description.'}</p></div>
          <div className="wide"><span>Acceptance Criteria</span><p>{item.acceptance_criteria || '—'}</p></div>
        </div>
        <div className="inspector-actions">
          <button className="button button-primary" onClick={() => openModal('case', { project_id: project.id, requirement_id: item.id })}>
            <Plus size={13} /> Add Test Case
          </button>
          <button className="button button-quiet" onClick={() => openModal('requirement_edit', { requirement: item })}>
            <Edit2 size={13} /> Edit
          </button>
          <button className="button button-danger" onClick={(e) => handleDelete('requirements', item.id, item.name, e)}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    );
  }

  if (type === 'defect') {
    return (
      <div className="inspector-content">
        <div className="inspector-head">
          <Bug size={20} className="text-coral" />
          <div>
            <span className="record-id">{item.id}</span>
            <h3>{item.title}</h3>
          </div>
        </div>
        <div className="inspector-fields">
          <div><span>Severity</span><span className={`status-pill ${statusClass(item.severity)}`}>{item.severity}</span></div>
          <div><span>Priority</span><span className={`status-pill ${statusClass(item.priority)}`}>{item.priority}</span></div>
          <div><span>Status</span><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></div>
          <div><span>Assigned Dev</span><strong>{item.assigned_developer || 'Unassigned'}</strong></div>
          <div><span>Reporter</span><strong>{item.reporter || '—'}</strong></div>
          <div><span>Jira Key</span><strong>{item.jira_key || '—'}</strong></div>
          <div className="wide"><span>Description</span><p>{item.description || 'No description.'}</p></div>
          {item.steps_to_reproduce && (
            <div className="wide"><span>Steps to Reproduce</span><p>{item.steps_to_reproduce}</p></div>
          )}
        </div>
        <div className="inspector-actions">
          <button className="button button-primary" onClick={() => openModal('defect_edit', { defect: item })}>
            <Edit2 size={13} /> Edit Defect
          </button>
          <button className="button button-danger" onClick={(e) => handleDelete('defects', item.id, item.title, e)}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    );
  }

  return null;
}

