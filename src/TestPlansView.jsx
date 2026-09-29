import React, { useState, useMemo } from 'react';
import {
  ClipboardList, Plus, Search, Filter, Calendar, Check, X,
  Trash2, Edit2, ChevronRight, ChevronDown, Layers, Play,
  User, CheckCircle2, AlertCircle, Link2, ExternalLink, MoreVertical,
  Activity, ArrowRight
} from 'lucide-react';

const toLabel = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const pick = (items, id) => items.find((item) => item.id === id);
const percentage = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 100) : 0;
const statusClass = (value = 'Not Run') => value.toLowerCase().replaceAll(' ', '-').replaceAll('/', '-');

export function TestPlansView({
  data,
  projectId,
  role,
  canEdit,
  currentUser,
  refresh,
  announce,
  openModal,
  request,
  onNavigate,
}) {
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlanDetail, setSelectedPlanDetail] = useState(null);
  const [actionMenuPlanId, setActionMenuPlanId] = useState(null);

  // Create Plan Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [planPriority, setPlanPriority] = useState('High');
  const [planLead, setPlanLead] = useState('');
  const [planStartDate, setPlanStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [planEndDate, setPlanEndDate] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  // Link Run Modal state
  const [linkingPlan, setLinkingPlan] = useState(null);
  const [selectedRunIdsToLink, setSelectedRunIdsToLink] = useState([]);
  const [linkBusy, setLinkBusy] = useState(false);

  // Project-scoped data
  const currentProject = pick(data.projects, projectId);
  const projectPlans = useMemo(() => data.plans.filter((p) => p.project_id === projectId), [data.plans, projectId]);
  const projectRuns = useMemo(() => data.runs.filter((r) => r.project_id === projectId), [data.runs, projectId]);
  const projectExecutions = useMemo(() => {
    const runIds = new Set(projectRuns.map((r) => r.id));
    return data.executions.filter((e) => runIds.has(e.run_id));
  }, [data.executions, projectRuns]);

  // Enriched plans with linked runs and progress stats
  const enrichedPlans = useMemo(() => {
    return projectPlans.map((plan) => {
      const linkedRuns = projectRuns.filter((r) => r.plan_id === plan.id);
      const linkedRunIds = new Set(linkedRuns.map((r) => r.id));
      const planExecutions = projectExecutions.filter((e) => linkedRunIds.has(e.run_id));
      
      const totalTests = planExecutions.length;
      const passed = planExecutions.filter((e) => e.status === 'Passed').length;
      const failed = planExecutions.filter((e) => e.status === 'Failed').length;
      const blocked = planExecutions.filter((e) => e.status === 'Blocked').length;
      const executed = passed + failed + blocked;
      
      const progressPercent = percentage(executed, totalTests);
      const passRate = percentage(passed, executed || 1);
      const isCompleted = plan.status === 'Completed' || plan.status === 'Done';

      return {
        ...plan,
        linkedRuns,
        totalTests,
        passed,
        failed,
        blocked,
        executed,
        progressPercent,
        passRate,
        isCompleted,
      };
    });
  }, [projectPlans, projectRuns, projectExecutions]);

  const activePlans = useMemo(() => enrichedPlans.filter((p) => !p.isCompleted), [enrichedPlans]);
  const completedPlans = useMemo(() => enrichedPlans.filter((p) => p.isCompleted), [enrichedPlans]);

  const displayedPlans = useMemo(() => {
    const list = activeTab === 'active' ? activePlans : completedPlans;
    return list.filter((p) => {
      if (searchQuery.trim()) {
        const term = searchQuery.trim().toLowerCase();
        const matches = p.name.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          (p.lead || '').toLowerCase().includes(term) ||
          (p.created_by || '').toLowerCase().includes(term) ||
          (p.description || '').toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [activeTab, activePlans, completedPlans, searchQuery]);

  // Create Test Plan handler
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!planName.trim()) return announce('Plan name is required');
    setCreateBusy(true);
    try {
      await request('/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: planName.trim(),
          project_id: projectId,
          description: planDesc.trim(),
          priority: planPriority,
          lead: planLead || currentUser?.name || 'QA Admin',
          start_date: planStartDate,
          end_date: planEndDate,
          status: 'In Progress',
          created_by: currentUser?.name || 'QA Admin',
        }),
      });

      await refresh();
      setShowCreateModal(false);
      setPlanName('');
      setPlanDesc('');
      announce('Test Plan created successfully!');
    } catch (err) {
      announce(err.message);
    } finally {
      setCreateBusy(false);
    }
  };

  // Toggle Plan Status
  const handleTogglePlanStatus = async (plan, event) => {
    if (event) event.stopPropagation();
    const newStatus = plan.isCompleted ? 'In Progress' : 'Completed';
    try {
      await request(`/plans/${encodeURIComponent(plan.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      await refresh();
      announce(`Test Plan "${plan.name}" marked as ${newStatus}`);
      setActionMenuPlanId(null);
    } catch (err) {
      announce(err.message);
    }
  };

  // Delete Plan handler
  const handleDeletePlan = (plan, event) => {
    if (event) event.stopPropagation();
    openModal('confirm_delete', {
      resource: 'plans',
      id: plan.id,
      title: `Delete Test Plan "${plan.name}"`,
      message: `Are you sure you want to delete test plan ${plan.name} (${plan.id})? Linked test runs will be unlinked safely.`,
      onConfirm: async () => {
        try {
          await request(`/plans/${encodeURIComponent(plan.id)}`, { method: 'DELETE' });
          await refresh();
          if (selectedPlanDetail?.id === plan.id) setSelectedPlanDetail(null);
          announce(`Test Plan "${plan.name}" deleted.`);
        } catch (err) {
          announce(err.message);
        }
      },
    });
    setActionMenuPlanId(null);
  };

  // Open Link Runs modal
  const handleOpenLinkRuns = (plan, event) => {
    if (event) event.stopPropagation();
    setLinkingPlan(plan);
    // pre-select already linked runs
    setSelectedRunIdsToLink(plan.linkedRuns.map((r) => r.id));
  };

  // Save Linked Runs
  const handleSaveLinkedRuns = async () => {
    if (!linkingPlan) return;
    setLinkBusy(true);
    try {
      // 1. Unlink any runs that were previously linked to this plan but deselected
      const previouslyLinked = linkingPlan.linkedRuns.map((r) => r.id);
      for (const runId of previouslyLinked) {
        if (!selectedRunIdsToLink.includes(runId)) {
          await request(`/runs/${encodeURIComponent(runId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ plan_id: null }),
          });
        }
      }

      // 2. Link newly selected runs to this plan
      for (const runId of selectedRunIdsToLink) {
        if (!previouslyLinked.includes(runId)) {
          await request(`/runs/${encodeURIComponent(runId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ plan_id: linkingPlan.id }),
          });
        }
      }

      await refresh();
      setLinkingPlan(null);
      announce(`Updated linked test runs for "${linkingPlan.name}"`);
    } catch (err) {
      announce(err.message);
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div className="test-plans-container">
      {/* Top Header */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {currentProject?.name || 'ACTIVE PROJECT'} <span className="heading-separator">/</span> PLANNING
          </div>
          <h1>Test Plans</h1>
          <p>Group test runs to track release readiness and test duration across builds.</p>
        </div>
        <div>
          {canEdit && (
            <button className="button button-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Create Test Plan
            </button>
          )}
        </div>
      </div>

      {/* Tabs and Search Toolbar */}
      <div className="browserstack-runs-toolbar">
        <div className="runs-tabs">
          <button
            className={`runs-tab-button ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active Plans
            <span className="runs-tab-badge">{activePlans.length}</span>
          </button>
          <button
            className={`runs-tab-button ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed Plans
            <span className="runs-tab-badge">{completedPlans.length}</span>
          </button>
        </div>

        <div className="runs-filters">
          <div className="search-field" style={{ minWidth: 280 }}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search test plans..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="icon-button" onClick={() => setSearchQuery('')}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plans List / Table */}
      <div className="table-panel">
        <div className="table-scroll">
          <table className="bs-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>
                  <input type="checkbox" aria-label="Select all plans" />
                </th>
                <th>Plan Name & Description</th>
                <th style={{ width: 100 }}>Priority</th>
                <th>Duration / Dates</th>
                <th>Linked Test Runs</th>
                <th style={{ width: 180 }}>Execution Progress</th>
                <th>Lead / Created By</th>
                <th style={{ textAlign: 'right', width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedPlans.map((plan) => {
                return (
                  <tr key={plan.id} className="bs-table-row">
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" aria-label={`Select plan ${plan.id}`} />
                    </td>
                    <td>
                      <div className="plan-name-cell">
                        <strong className="plan-title-text">{plan.name}</strong>
                        {plan.description && (
                          <span className="plan-desc-text">{plan.description}</span>
                        )}
                        <span className="plan-id-text">{plan.id}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`priority-tag p-${(plan.priority || 'medium').toLowerCase()}`}>
                        {plan.priority || 'Medium'}
                      </span>
                    </td>
                    <td>
                      <div className="plan-date-cell">
                        <Calendar size={13} className="text-muted" />
                        <span>
                          {plan.start_date || 'TBD'} &rarr; {plan.end_date || 'Open'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="linked-runs-cell">
                        <button
                          type="button"
                          className="link-runs-btn"
                          title="Click to manage linked test runs"
                          onClick={(e) => handleOpenLinkRuns(plan, e)}
                        >
                          <Link2 size={13} />
                          <strong>{plan.linkedRuns.length}</strong> runs linked
                        </button>
                        {plan.linkedRuns.length > 0 && (
                          <div className="linked-runs-preview">
                            {plan.linkedRuns.slice(0, 2).map((r) => (
                              <span key={r.id} className="mini-run-pill">{r.name}</span>
                            ))}
                            {plan.linkedRuns.length > 2 && (
                              <span className="mini-more-pill">+{plan.linkedRuns.length - 2} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="plan-progress-cell">
                        <div className="plan-progress-header">
                          <span>{plan.progressPercent}% Executed</span>
                          {plan.executed > 0 && (
                            <strong className="text-success">{plan.passRate}% Pass</strong>
                          )}
                        </div>
                        <div className="progress-track-bs">
                          <div
                            className="progress-fill-pass"
                            style={{ width: `${percentage(plan.passed, plan.totalTests || 1)}%` }}
                          />
                          <div
                            className="progress-fill-fail"
                            style={{ width: `${percentage(plan.failed, plan.totalTests || 1)}%` }}
                          />
                          <div
                            className="progress-fill-block"
                            style={{ width: `${percentage(plan.blocked, plan.totalTests || 1)}%` }}
                          />
                        </div>
                        <div className="plan-progress-sub">
                          <span>{plan.totalTests} total tests</span>
                          {plan.failed > 0 && <span className="text-danger">{plan.failed} failed</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="plan-owner-cell">
                        <div className="owner-row">
                          <User size={12} className="text-muted" />
                          <span>{plan.lead || 'QA Lead'}</span>
                        </div>
                        <span className="creator-note">By {plan.created_by || 'QA Admin'}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          className="button button-small button-outline"
                          title="Manage linked test runs"
                          onClick={(e) => handleOpenLinkRuns(plan, e)}
                        >
                          <Link2 size={12} /> Link Runs
                        </button>

                        <div style={{ position: 'relative' }}>
                          <button
                            className="icon-button"
                            title="More options"
                            onClick={() => setActionMenuPlanId(actionMenuPlanId === plan.id ? null : plan.id)}
                          >
                            <MoreVertical size={14} />
                          </button>

                          {actionMenuPlanId === plan.id && (
                            <div className="dropdown-action-menu">
                              <button onClick={(e) => handleTogglePlanStatus(plan, e)}>
                                <Check size={14} /> {plan.isCompleted ? 'Reopen Plan' : 'Mark Completed'}
                              </button>
                              {canEdit && (
                                <button className="text-danger" onClick={(e) => handleDeletePlan(plan, e)}>
                                  <Trash2 size={14} /> Delete Plan
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {displayedPlans.length === 0 && (
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <ClipboardList size={36} className="text-muted" />
            <strong style={{ marginTop: 12 }}>No test plans found</strong>
            <span style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
              {activeTab === 'active'
                ? 'Create a test plan to group runs for your upcoming release.'
                : 'There are no completed test plans yet.'}
            </span>
            {canEdit && activeTab === 'active' && (
              <button
                className="button button-primary"
                style={{ marginTop: 16 }}
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={15} /> Create Test Plan
              </button>
            )}
          </div>
        )}

        <div className="table-footer">
          <span>
            Showing <strong>{displayedPlans.length}</strong> of <strong>{enrichedPlans.length}</strong> test plans
          </span>
          <span style={{ color: '#64748b' }}>Project: {currentProject?.name}</span>
        </div>
      </div>

      {/* CREATE PLAN MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => !createBusy && setShowCreateModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Create Test Plan</h2>
                <p>Define release scope, duration, and link target test runs.</p>
              </div>
              <button className="icon-button" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="modal-body-scroll">
              <div className="form-group">
                <label>Plan Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q4 Major Release Test Plan"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Description & Scope</label>
                <textarea
                  rows={3}
                  placeholder="Outline the testing objectives and acceptance criteria..."
                  value={planDesc}
                  onChange={(e) => setPlanDesc(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Priority</label>
                  <select value={planPriority} onChange={(e) => setPlanPriority(e.target.value)}>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Test Lead / Owner</label>
                  <select value={planLead} onChange={(e) => setPlanLead(e.target.value)}>
                    <option value="">Default ({currentUser?.name || 'QA Admin'})</option>
                    {data.users.map((u) => (
                      <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={planStartDate}
                    onChange={(e) => setPlanStartDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Target End Date</label>
                  <input
                    type="date"
                    value={planEndDate}
                    onChange={(e) => setPlanEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: 24 }}>
                <button type="button" className="button button-quiet" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={createBusy}>
                  {createBusy ? 'Creating Plan...' : 'Create Test Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINK TEST RUNS MODAL */}
      {linkingPlan && (
        <div className="modal-backdrop" onClick={() => !linkBusy && setLinkingPlan(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Link Test Runs to Plan</h2>
                <p>Select which runs belong to <strong>{linkingPlan.name}</strong></p>
              </div>
              <button className="icon-button" onClick={() => setLinkingPlan(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-scroll">
              <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
                All selected test runs will report their execution progress directly into this test plan.
              </div>

              <div className="runs-link-list">
                {projectRuns.map((run) => {
                  const isChecked = selectedRunIdsToLink.includes(run.id);
                  const isLinkedToOther = run.plan_id && run.plan_id !== linkingPlan.id;
                  const otherPlanName = isLinkedToOther ? pick(data.plans, run.plan_id)?.name : null;

                  return (
                    <label key={run.id} className={`run-link-row ${isChecked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedRunIdsToLink([...selectedRunIdsToLink, run.id]);
                          else setSelectedRunIdsToLink(selectedRunIdsToLink.filter((id) => id !== run.id));
                        }}
                      />
                      <div className="run-link-info">
                        <strong>{run.name}</strong>
                        <div className="run-link-sub">
                          <span>{run.id}</span> &bull;
                          <span>{run.environment}</span> &bull;
                          <span>{run.status}</span>
                          {isLinkedToOther && (
                            <span className="text-warning"> (Currently linked to: {otherPlanName})</span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}

                {projectRuns.length === 0 && (
                  <div className="empty-state" style={{ padding: 20 }}>
                    <span>No test runs exist in this project yet.</span>
                  </div>
                )}
              </div>

              <div className="modal-actions" style={{ marginTop: 20 }}>
                <button type="button" className="button button-quiet" onClick={() => setLinkingPlan(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={linkBusy}
                  onClick={handleSaveLinkedRuns}
                >
                  {linkBusy ? 'Saving...' : 'Save Linked Runs'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

