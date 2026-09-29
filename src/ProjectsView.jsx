import React, { useState, useMemo } from 'react';
import {
  FolderKanban, Plus, Search, Filter, Check, X, Trash2, Edit2,
  ExternalLink, Layers, Play, FileText, User, MoreVertical,
  CheckCircle2, Clock, Globe, ArrowRight, Sparkles, AlertCircle
} from 'lucide-react';

const toLabel = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const pick = (items, id) => items.find((item) => item.id === id);
const percentage = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 100) : 0;

export function ProjectsView({
  data,
  projectId,
  setProjectId,
  role,
  canEdit,
  currentUser,
  refresh,
  announce,
  openModal,
  request,
  onNavigate,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionMenuProjectId, setActionMenuProjectId] = useState(null);

  // Create Project form state
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [description, setDescription] = useState('');
  const [manager, setManager] = useState('');
  const [qaLead, setQaLead] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [jiraUrl, setJiraUrl] = useState('');
  const [targetReleaseDate, setTargetReleaseDate] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return data.projects.filter((p) => {
      if (statusFilter !== 'All' && (p.status || 'Active') !== statusFilter) return false;
      if (searchQuery.trim()) {
        const term = searchQuery.trim().toLowerCase();
        const matches = p.name.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          (p.product || '').toLowerCase().includes(term) ||
          (p.manager || '').toLowerCase().includes(term) ||
          (p.qa_lead || '').toLowerCase().includes(term) ||
          (p.created_by || '').toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [data.projects, statusFilter, searchQuery]);

  // Handle setting active project
  const handleSelectProject = (id, event) => {
    if (event) event.stopPropagation();
    setProjectId(id);
    announce(`Switched active project to "${pick(data.projects, id)?.name}"`);
  };

  // Handle create project
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!name.trim()) return announce('Project name is required');
    setCreateBusy(true);
    try {
      const res = await request('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          product: product.trim(),
          description: description.trim(),
          manager: manager.trim(),
          qa_lead: qaLead.trim() || currentUser?.name || 'QA Admin',
          app_url: appUrl.trim(),
          jira_url: jiraUrl.trim(),
          target_release_date: targetReleaseDate,
          status: 'Active',
          created_by: currentUser?.name || 'QA Admin',
        }),
      });

      const updated = await refresh();
      if (res?.id) {
        setProjectId(res.id); // Automatically activate the new project!
      }
      setShowCreateModal(false);
      setName('');
      setProduct('');
      setDescription('');
      announce('Project created successfully and set as active!');
    } catch (err) {
      announce(err.message);
    } finally {
      setCreateBusy(false);
    }
  };

  // Handle delete project
  const handleDeleteProject = (proj, event) => {
    if (event) event.stopPropagation();
    openModal('confirm_delete', {
      resource: 'projects',
      id: proj.id,
      title: `Delete Project "${proj.name}"`,
      message: `Are you sure you want to delete "${proj.name}" (${proj.id})? All associated test cases, plans, suites, and runs will be safely removed.`,
      onConfirm: async () => {
        try {
          await request(`/projects/${encodeURIComponent(proj.id)}`, { method: 'DELETE' });
          const res = await refresh();
          if (projectId === proj.id) {
            const nextProj = res?.projects?.find((p) => p.id !== proj.id);
            if (nextProj) setProjectId(nextProj.id);
          }
          announce(`Project "${proj.name}" deleted.`);
        } catch (err) {
          announce(err.message);
        }
      },
    });
    setActionMenuProjectId(null);
  };

  return (
    <div className="projects-view-container">
      {/* Top Banner / Get Started (BrowserStack Style) */}
      <div className="projects-banner">
        <div className="banner-content">
          <div className="banner-text">
            <h2>Welcome to Test Management</h2>
            <p>Organize test repositories, track test run executions, and monitor release readiness across all your projects.</p>
          </div>
          <div className="banner-quick-actions">
            <button className="banner-card-btn" onClick={() => setShowCreateModal(true)}>
              <div className="banner-card-icon"><Plus size={18} /></div>
              <div>
                <strong>Create Project</strong>
                <span>New workspace for your app</span>
              </div>
            </button>
            <button className="banner-card-btn" onClick={() => onNavigate('Test Cases')}>
              <div className="banner-card-icon"><FileText size={18} /></div>
              <div>
                <strong>Explore Test Cases</strong>
                <span>Manage folders and suites</span>
              </div>
            </button>
            <button className="banner-card-btn" onClick={() => onNavigate('Test Runs')}>
              <div className="banner-card-icon"><Play size={18} /></div>
              <div>
                <strong>Launch Test Run</strong>
                <span>Execute test cycles</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="page-heading" style={{ marginTop: 24 }}>
        <div>
          <div className="eyebrow">WORKSPACE / PROJECTS</div>
          <h1>All Projects</h1>
          <p>Switch between projects, review test coverage, and manage workspace settings.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {canEdit && (
            <button className="button button-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Create Project
            </button>
          )}
        </div>
      </div>

      {/* Search & Controls */}
      <div className="browserstack-runs-toolbar">
        <div className="runs-filters" style={{ width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="search-field" style={{ minWidth: 300 }}>
              <Search size={15} />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="icon-button" onClick={() => setSearchQuery('')}>
                  <X size={13} />
                </button>
              )}
            </div>

            <label className="filter-select">
              <span>STATUS</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Archived">Archived</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`button button-small ${viewMode === 'cards' ? 'button-primary' : 'button-outline'}`}
              onClick={() => setViewMode('cards')}
            >
              Cards
            </button>
            <button
              className={`button button-small ${viewMode === 'table' ? 'button-primary' : 'button-outline'}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Projects Cards Grid */}
      {viewMode === 'cards' && (
        <div className="projects-card-grid">
          {filteredProjects.map((p) => {
            const isCurrent = p.id === projectId;
            const casesCount = data.cases.filter((c) => c.project_id === p.id).length;
            const runsCount = data.runs.filter((r) => r.project_id === p.id).length;
            const plansCount = data.plans.filter((pl) => pl.project_id === p.id).length;
            const pRuns = data.runs.filter((r) => r.project_id === p.id);
            const pRunIds = new Set(pRuns.map((r) => r.id));
            const pExecs = data.executions.filter((e) => pRunIds.has(e.run_id));
            const passed = pExecs.filter((e) => e.status === 'Passed').length;
            const passRate = percentage(passed, pExecs.length);

            return (
              <div
                key={p.id}
                className={`project-card-bs ${isCurrent ? 'active-border' : ''}`}
                onClick={() => handleSelectProject(p.id)}
              >
                <div className="proj-card-head">
                  <div className="proj-avatar-icon">
                    <FolderKanban size={20} />
                  </div>
                  <div className="proj-head-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{p.name}</strong>
                      {isCurrent && <span className="active-badge">ACTIVE</span>}
                    </div>
                    <span className="proj-product-text">{p.product || 'General Application'} &bull; {p.id}</span>
                  </div>

                  <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-button"
                      onClick={() => setActionMenuProjectId(actionMenuProjectId === p.id ? null : p.id)}
                    >
                      <MoreVertical size={14} />
                    </button>
                    {actionMenuProjectId === p.id && (
                      <div className="dropdown-action-menu">
                        <button onClick={(e) => handleSelectProject(p.id, e)}>
                          <Check size={14} /> Set as Active
                        </button>
                        {canEdit && (
                          <button className="text-danger" onClick={(e) => handleDeleteProject(p, e)}>
                            <Trash2 size={14} /> Delete Project
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {p.description && (
                  <p className="proj-desc">{p.description}</p>
                )}

                <div className="proj-metrics-row">
                  <div className="metric-chip">
                    <FileText size={13} className="text-muted" />
                    <span><strong>{casesCount}</strong> cases</span>
                  </div>
                  <div className="metric-chip">
                    <Play size={13} className="text-muted" />
                    <span><strong>{runsCount}</strong> runs</span>
                  </div>
                  <div className="metric-chip">
                    <Layers size={13} className="text-muted" />
                    <span><strong>{plansCount}</strong> plans</span>
                  </div>
                  {pExecs.length > 0 && (
                    <div className="metric-chip text-success">
                      <span><strong>{passRate}%</strong> pass</span>
                    </div>
                  )}
                </div>

                <div className="proj-card-footer">
                  <div className="proj-creator-info">
                    <User size={12} className="text-muted" />
                    <span>Created by <strong>{p.created_by || 'QA Admin'}</strong></span>
                  </div>
                  <div className="proj-actions">
                    {isCurrent ? (
                      <button
                        className="button button-small button-outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate('Test Cases');
                        }}
                      >
                        Open Cases <ArrowRight size={12} />
                      </button>
                    ) : (
                      <button
                        className="button button-small button-primary"
                        onClick={(e) => handleSelectProject(p.id, e)}
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Projects Table View */}
      {viewMode === 'table' && (
        <div className="table-panel">
          <div className="table-scroll">
            <table className="bs-table">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>
                    <input type="checkbox" aria-label="Select all projects" />
                  </th>
                  <th>Project Name & Details</th>
                  <th>Product</th>
                  <th>Cases / Runs</th>
                  <th>QA Lead</th>
                  <th>Created By</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => {
                  const isCurrent = p.id === projectId;
                  const casesCount = data.cases.filter((c) => c.project_id === p.id).length;
                  const runsCount = data.runs.filter((r) => r.project_id === p.id).length;

                  return (
                    <tr
                      key={p.id}
                      className="bs-table-row"
                      style={isCurrent ? { background: '#1e293b' } : {}}
                      onClick={() => handleSelectProject(p.id)}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${p.id}`} />
                      </td>
                      <td>
                        <div className="plan-name-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong className="plan-title-text">{p.name}</strong>
                            {isCurrent && <span className="active-badge">ACTIVE</span>}
                          </div>
                          <span className="plan-id-text">{p.id}</span>
                        </div>
                      </td>
                      <td><span>{p.product || '—'}</span></td>
                      <td>
                        <span style={{ fontSize: 13 }}>
                          <strong>{casesCount}</strong> cases &bull; <strong>{runsCount}</strong> runs
                        </span>
                      </td>
                      <td><span>{p.qa_lead || '—'}</span></td>
                      <td>
                        <span className="creator-chip">{p.created_by || 'QA Admin'}</span>
                      </td>
                      <td>
                        <span className={`status-pill ${p.status === 'Active' ? 'passed' : 'blocked'}`}>
                          {p.status || 'Active'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {!isCurrent && (
                            <button
                              className="button button-small button-outline"
                              onClick={(e) => handleSelectProject(p.id, e)}
                            >
                              Select
                            </button>
                          )}
                          {isCurrent && (
                            <button
                              className="button button-small button-primary"
                              onClick={() => onNavigate('Test Cases')}
                            >
                              Go to Cases
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="icon-button text-danger"
                              title="Delete project"
                              onClick={(e) => handleDeleteProject(p, e)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <span>Showing <strong>{filteredProjects.length}</strong> projects</span>
            <span>Active Project ID: {projectId}</span>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => !createBusy && setShowCreateModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Create Project</h2>
                <p>Set up a project to organize test cases, suites, and test runs.</p>
              </div>
              <button className="icon-button" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="modal-body-scroll">
              <div className="form-group">
                <label>Project Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payment Gateway Modernization"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Product / Module</label>
                <input
                  type="text"
                  placeholder="e.g. Core Banking / Payments"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={2}
                  placeholder="Describe the application, scope, and objectives..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>QA Lead</label>
                  <input
                    type="text"
                    placeholder="e.g. Imran QA"
                    value={qaLead}
                    onChange={(e) => setQaLead(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Project Manager</label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Connor"
                    value={manager}
                    onChange={(e) => setManager(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Jira Project / Base URL</label>
                  <input
                    type="text"
                    placeholder="https://jira.company.com"
                    value={jiraUrl}
                    onChange={(e) => setJiraUrl(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Target Release Date</label>
                  <input
                    type="date"
                    value={targetReleaseDate}
                    onChange={(e) => setTargetReleaseDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: 24 }}>
                <button type="button" className="button button-quiet" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={createBusy}>
                  {createBusy ? 'Creating Project...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

