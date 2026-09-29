import React, { useState, useMemo } from 'react';
import {
  Play, Plus, Search, Filter, CheckCircle2, XCircle, AlertTriangle,
  Clock, Check, X, Trash2, Edit2, ChevronRight, ChevronDown,
  Layers, ExternalLink, RefreshCw, FileText, User, MoreVertical,
  CheckSquare, Square, Eye, ShieldAlert, ArrowRight, Sparkles, AlertCircle
} from 'lucide-react';

const toLabel = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const pick = (items, id) => items.find((item) => item.id === id);
const percentage = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 100) : 0;
const statusClass = (value = 'Not Run') => value.toLowerCase().replaceAll(' ', '-').replaceAll('/', '-');

export function TestRunsView({
  data,
  projectId,
  role,
  canEdit,
  currentUser,
  refresh,
  announce,
  openModal,
  request,
}) {
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'closed'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlanFilter, setSelectedPlanFilter] = useState('ALL');
  const [actionMenuRunId, setActionMenuRunId] = useState(null);

  // Run creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRunName, setNewRunName] = useState('');
  const [newRunPlanId, setNewRunPlanId] = useState('');
  const [newRunEnv, setNewRunEnv] = useState('Staging');
  const [newRunBrowser, setNewRunBrowser] = useState('Chrome 128');
  const [newRunAssignee, setNewRunAssignee] = useState('');
  const [selectionMode, setSelectionMode] = useState('folders'); // 'folders' | 'cases' | 'all'
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const [createBusy, setCreateBusy] = useState(false);

  // Execution modal state (launch run)
  const [executingRun, setExecutingRun] = useState(null);
  const [activeExecCaseIndex, setActiveExecCaseIndex] = useState(0);
  const [jiraInput, setJiraInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [execBusy, setExecBusy] = useState(false);

  // Project-scoped data
  const currentProject = pick(data.projects, projectId);
  const projectRuns = useMemo(() => data.runs.filter((r) => r.project_id === projectId), [data.runs, projectId]);
  const projectCases = useMemo(() => data.cases.filter((c) => c.project_id === projectId), [data.cases, projectId]);
  const projectSuites = useMemo(() => data.suites.filter((s) => s.project_id === projectId), [data.suites, projectId]);
  const projectPlans = useMemo(() => data.plans.filter((p) => p.project_id === projectId), [data.plans, projectId]);
  const projectExecutions = useMemo(() => {
    const runIds = new Set(projectRuns.map((r) => r.id));
    return data.executions.filter((e) => runIds.has(e.run_id));
  }, [data.executions, projectRuns]);

  // Enriched runs with execution stats
  const enrichedRuns = useMemo(() => {
    return projectRuns.map((run) => {
      const execs = projectExecutions.filter((e) => e.run_id === run.id);
      const total = execs.length;
      const passed = execs.filter((e) => e.status === 'Passed').length;
      const failed = execs.filter((e) => e.status === 'Failed').length;
      const blocked = execs.filter((e) => e.status === 'Blocked').length;
      const skipped = execs.filter((e) => e.status === 'Skipped').length;
      const notRun = execs.filter((e) => e.status === 'Not Run').length;
      const executed = passed + failed + blocked;
      const percent = percentage(executed, total);
      const passRate = percentage(passed, total);
      const plan = pick(projectPlans, run.plan_id);

      return {
        ...run,
        executions: execs,
        totalTests: total,
        passed,
        failed,
        blocked,
        skipped,
        notRun,
        percent,
        passRate,
        planName: plan?.name || null,
        isClosed: run.status === 'Completed' || run.status === 'Cancelled',
      };
    });
  }, [projectRuns, projectExecutions, projectPlans]);

  // Tab counts
  const activeRuns = useMemo(() => enrichedRuns.filter((r) => !r.isClosed), [enrichedRuns]);
  const closedRuns = useMemo(() => enrichedRuns.filter((r) => r.isClosed), [enrichedRuns]);

  // Filtered runs for current tab
  const displayedRuns = useMemo(() => {
    const list = activeTab === 'active' ? activeRuns : closedRuns;
    return list.filter((r) => {
      if (selectedPlanFilter !== 'ALL' && r.plan_id !== selectedPlanFilter) return false;
      if (searchQuery.trim()) {
        const term = searchQuery.trim().toLowerCase();
        const matches = r.name.toLowerCase().includes(term) ||
          r.id.toLowerCase().includes(term) ||
          (r.assigned_to || '').toLowerCase().includes(term) ||
          (r.created_by || '').toLowerCase().includes(term) ||
          (r.environment || '').toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [activeTab, activeRuns, closedRuns, selectedPlanFilter, searchQuery]);

  // Cases calculated for new run creation
  const calculatedCasesForCreate = useMemo(() => {
    if (selectionMode === 'all') return projectCases;
    if (selectionMode === 'folders') {
      return projectCases.filter((c) => selectedFolderIds.includes(c.suite_id));
    }
    if (selectionMode === 'cases') {
      return projectCases.filter((c) => selectedCaseIds.includes(c.id));
    }
    return [];
  }, [selectionMode, projectCases, selectedFolderIds, selectedCaseIds]);

  // Handle run creation
  const handleCreateRun = async (e) => {
    e.preventDefault();
    if (!newRunName.trim()) return announce('Run name is required');
    if (calculatedCasesForCreate.length === 0) return announce('Select at least one test case or folder');

    setCreateBusy(true);
    try {
      const payload = {
        name: newRunName.trim(),
        project_id: projectId,
        plan_id: newRunPlanId || null,
        environment: newRunEnv,
        browser: newRunBrowser,
        assigned_to: newRunAssignee || currentUser?.name || 'QA Admin',
        created_by: currentUser?.name || 'QA Admin',
        status: 'In Progress',
        start_date: new Date().toISOString().slice(0, 10),
      };

      if (selectionMode === 'folders') {
        payload.suite_ids = selectedFolderIds;
      } else if (selectionMode === 'cases') {
        payload.case_ids = selectedCaseIds;
      } else {
        payload.all_project_cases = true;
      }

      await request('/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await refresh();
      setShowCreateModal(false);
      setNewRunName('');
      setNewRunPlanId('');
      setSelectedFolderIds([]);
      setSelectedCaseIds([]);
      announce(`Test Run created with ${calculatedCasesForCreate.length} test cases!`);
    } catch (err) {
      announce(err.message);
    } finally {
      setCreateBusy(false);
    }
  };

  // Handle close / reopen run
  const handleToggleRunStatus = async (run, event) => {
    if (event) event.stopPropagation();
    const newStatus = run.isClosed ? 'In Progress' : 'Completed';
    try {
      await request(`/runs/${encodeURIComponent(run.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          end_date: newStatus === 'Completed' ? new Date().toISOString().slice(0, 10) : '',
        }),
      });
      await refresh();
      announce(`Run "${run.name}" marked as ${newStatus}`);
      setActionMenuRunId(null);
    } catch (err) {
      announce(err.message);
    }
  };

  // Handle delete run
  const handleDeleteRun = (run, event) => {
    if (event) event.stopPropagation();
    openModal('confirm_delete', {
      resource: 'runs',
      id: run.id,
      title: `Delete Test Run "${run.name}"`,
      message: `Are you sure you want to delete test run ${run.name} (${run.id})? All execution logs and results will be permanently removed.`,
      onConfirm: async () => {
        try {
          await request(`/runs/${encodeURIComponent(run.id)}`, { method: 'DELETE' });
          await refresh();
          if (executingRun?.id === run.id) setExecutingRun(null);
          announce(`Test Run "${run.name}" deleted.`);
        } catch (err) {
          announce(err.message);
        }
      },
    });
    setActionMenuRunId(null);
  };

  // Open execution modal
  const handleOpenExecute = (run) => {
    const fullRun = enrichedRuns.find((r) => r.id === run.id) || run;
    setExecutingRun(fullRun);
    setActiveExecCaseIndex(0);
    const firstExec = fullRun.executions?.[0];
    setJiraInput(firstExec?.jira_ticket || '');
    setCommentInput(firstExec?.comment || '');
  };

  // Currently selected execution in drawer
  const currentExec = executingRun?.executions?.[activeExecCaseIndex];

  // When active case changes in execution drawer
  const handleSelectExecCase = (index) => {
    setActiveExecCaseIndex(index);
    const targetExec = executingRun?.executions?.[index];
    setJiraInput(targetExec?.jira_ticket || '');
    setCommentInput(targetExec?.comment || '');
  };

  // Handle updating an execution step or overall execution
  const handleUpdateExecution = async (status) => {
    if (!currentExec) return;
    setExecBusy(true);
    try {
      await request(`/executions/${encodeURIComponent(currentExec.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          jira_ticket: jiraInput.trim(),
          comment: commentInput.trim(),
          tester: currentUser?.name || 'QA Admin',
        }),
      });

      // Also auto-mark all steps of this execution to match if passing/failing
      if (currentExec.steps && currentExec.steps.length) {
        for (const st of currentExec.steps) {
          await request(`/execution-steps/${encodeURIComponent(st.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
          });
        }
      }

      await refresh();
      announce(`Case marked as ${status}${status === 'Failed' && jiraInput ? ` with Jira ${jiraInput}` : ''}`);

      // Update local executingRun state
      setExecutingRun((prev) => {
        if (!prev) return null;
        const updatedExecs = prev.executions.map((e) =>
          e.id === currentExec.id
            ? { ...e, status, jira_ticket: jiraInput.trim(), comment: commentInput.trim() }
            : e
        );
        return { ...prev, executions: updatedExecs };
      });

      // Auto-advance to next test if available
      if (activeExecCaseIndex < (executingRun.executions?.length || 0) - 1) {
        handleSelectExecCase(activeExecCaseIndex + 1);
      }
    } catch (err) {
      announce(err.message);
    } finally {
      setExecBusy(false);
    }
  };

  // Update a single step in execution modal
  const handleUpdateStep = async (step, stepStatus) => {
    try {
      await request(`/execution-steps/${encodeURIComponent(step.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: stepStatus }),
      });
      await refresh();
      announce(`Step #${step.step_number} marked as ${stepStatus}`);

      // Refresh executingRun
      setExecutingRun((prev) => {
        if (!prev) return null;
        const updatedExecs = prev.executions.map((e) => {
          if (e.id === currentExec.id) {
            const updatedSteps = (e.steps || []).map((s) => s.id === step.id ? { ...s, status: stepStatus } : s);
            return { ...e, steps: updatedSteps };
          }
          return e;
        });
        return { ...prev, executions: updatedExecs };
      });
    } catch (err) {
      announce(err.message);
    }
  };

  return (
    <div className="test-runs-container">
      {/* Top Header */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {currentProject?.name || 'ACTIVE PROJECT'} <span className="heading-separator">/</span> EXECUTION
          </div>
          <h1>Test Runs</h1>
          <p>Execute manual test runs, track completion progress, and log Jira tickets on failures.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {canEdit && (
            <button className="button button-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Create Manual Run
            </button>
          )}
        </div>
      </div>

      {/* Tabs and Toolbar */}
      <div className="browserstack-runs-toolbar">
        <div className="runs-tabs">
          <button
            className={`runs-tab-button ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active Runs
            <span className="runs-tab-badge">{activeRuns.length}</span>
          </button>
          <button
            className={`runs-tab-button ${activeTab === 'closed' ? 'active' : ''}`}
            onClick={() => setActiveTab('closed')}
          >
            Closed Runs
            <span className="runs-tab-badge">{closedRuns.length}</span>
          </button>
        </div>

        <div className="runs-filters">
          <div className="search-field" style={{ minWidth: 260 }}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search test runs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="icon-button" onClick={() => setSearchQuery('')}>
                <X size={13} />
              </button>
            )}
          </div>

          {projectPlans.length > 0 && (
            <label className="filter-select">
              <span>PLAN</span>
              <select value={selectedPlanFilter} onChange={(e) => setSelectedPlanFilter(e.target.value)}>
                <option value="ALL">All Test Plans</option>
                {projectPlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          )}
        </div>
      </div>

      {/* Runs Table / Cards */}
      <div className="table-panel">
        <div className="table-scroll">
          <table className="bs-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>
                  <input type="checkbox" aria-label="Select all runs" />
                </th>
                <th style={{ width: 90 }}>Progress</th>
                <th>Run Name & Info</th>
                <th>Test Plan</th>
                <th>Assignee</th>
                <th>Tests</th>
                <th>Results Breakdown</th>
                <th>Created By</th>
                <th style={{ textAlign: 'right', width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedRuns.map((run) => {
                return (
                  <tr key={run.id} className="bs-table-row" onClick={() => handleOpenExecute(run)}>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select run ${run.id}`} />
                    </td>
                    <td>
                      {/* Circular Progress Badge */}
                      <div className="circular-progress-wrap" title={`${run.percent}% Executed (${run.passRate}% Passed)`}>
                        <div
                          className="circular-progress"
                          style={{
                            background: `conic-gradient(
                              #10b981 0% ${run.passRate}%,
                              #ef4444 ${run.passRate}% ${percentage(run.passed + run.failed, run.totalTests)}%,
                              #f59e0b ${percentage(run.passed + run.failed, run.totalTests)}% ${run.percent}%,
                              #334155 ${run.percent}% 100%
                            )`
                          }}
                        >
                          <div className="circular-progress-inner">
                            <span>{run.percent}%</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="run-title-cell">
                        <strong className="run-name-text">{run.name}</strong>
                        <div className="run-meta-row">
                          <span className="run-id-pill">{run.id}</span>
                          <span className="run-meta-item">{run.environment || 'Staging'}</span>
                          {run.browser && <span className="run-meta-item">{run.browser}</span>}
                          <span className="run-meta-item">{run.start_date || 'Recent'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {run.planName ? (
                        <span className="plan-tag" title={run.planName}>
                          <Layers size={12} /> {run.planName}
                        </span>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12 }}>Unlinked</span>
                      )}
                    </td>
                    <td>
                      <div className="assignee-cell">
                        <User size={13} className="text-muted" />
                        <span>{run.assigned_to || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="run-tests-count">
                        <strong>{run.totalTests}</strong> tests
                      </span>
                    </td>
                    <td>
                      <div className="results-pill-group">
                        {run.passed > 0 && (
                          <span className="res-pill res-passed" title={`${run.passed} Passed`}>
                            {run.passed} Passed
                          </span>
                        )}
                        {run.failed > 0 && (
                          <span className="res-pill res-failed" title={`${run.failed} Failed`}>
                            {run.failed} Failed
                          </span>
                        )}
                        {run.blocked > 0 && (
                          <span className="res-pill res-blocked" title={`${run.blocked} Blocked`}>
                            {run.blocked} Blocked
                          </span>
                        )}
                        {run.notRun > 0 && (
                          <span className="res-pill res-not-run" title={`${run.notRun} Not Run`}>
                            {run.notRun} Not Run
                          </span>
                        )}
                        {run.totalTests === 0 && (
                          <span className="text-muted" style={{ fontSize: 11 }}>No tests</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="creator-chip" title={`Created by ${run.created_by || 'QA Admin'}`}>
                        {run.created_by || 'QA Admin'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          className="button button-small button-outline"
                          title="Launch test execution"
                          onClick={() => handleOpenExecute(run)}
                        >
                          <Play size={12} /> Run
                        </button>

                        <div style={{ position: 'relative' }}>
                          <button
                            className="icon-button"
                            title="More options"
                            onClick={() => setActionMenuRunId(actionMenuRunId === run.id ? null : run.id)}
                          >
                            <MoreVertical size={14} />
                          </button>

                          {actionMenuRunId === run.id && (
                            <div className="dropdown-action-menu">
                              <button onClick={(e) => handleToggleRunStatus(run, e)}>
                                <Check size={14} /> {run.isClosed ? 'Reopen Run' : 'Mark as Closed'}
                              </button>
                              {canEdit && (
                                <button className="text-danger" onClick={(e) => handleDeleteRun(run, e)}>
                                  <Trash2 size={14} /> Delete Run
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

        {displayedRuns.length === 0 && (
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <Play size={36} className="text-muted" />
            <strong style={{ marginTop: 12 }}>No test runs found</strong>
            <span style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
              {activeTab === 'active'
                ? 'Create a manual test run to execute test cases for this project.'
                : 'There are no closed test runs yet.'}
            </span>
            {canEdit && activeTab === 'active' && (
              <button
                className="button button-primary"
                style={{ marginTop: 16 }}
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={15} /> Create Manual Run
              </button>
            )}
          </div>
        )}

        <div className="table-footer">
          <span>
            Showing <strong>{displayedRuns.length}</strong> of <strong>{enrichedRuns.length}</strong> runs
          </span>
          <span style={{ color: '#64748b' }}>Project: {currentProject?.name}</span>
        </div>
      </div>

      {/* CREATE MANUAL RUN MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => !createBusy && setShowCreateModal(false)}>
          <div className="modal-window wide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Create Manual Test Run</h2>
                <p>Select which folder of test cases or custom test cases you want to run.</p>
              </div>
              <button className="icon-button" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRun} className="modal-body-scroll">
              <div className="form-group">
                <label>Run Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Sprint 24 Regression - Web & Mobile"
                  value={newRunName}
                  onChange={(e) => setNewRunName(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Link to Test Plan (Optional)</label>
                  <select value={newRunPlanId} onChange={(e) => setNewRunPlanId(e.target.value)}>
                    <option value="">No Plan (Ad-hoc run)</option>
                    {projectPlans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Assignee</label>
                  <select value={newRunAssignee} onChange={(e) => setNewRunAssignee(e.target.value)}>
                    <option value="">Assign to Me ({currentUser?.name || 'QA Admin'})</option>
                    {data.users.map((u) => (
                      <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Environment</label>
                  <select value={newRunEnv} onChange={(e) => setNewRunEnv(e.target.value)}>
                    <option value="Staging">Staging</option>
                    <option value="Production">Production</option>
                    <option value="QA / Test">QA / Test</option>
                    <option value="Development">Development</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Browser / Platform</label>
                  <select value={newRunBrowser} onChange={(e) => setNewRunBrowser(e.target.value)}>
                    <option value="Chrome 128 (Windows)">Chrome 128 (Windows)</option>
                    <option value="Firefox 130 (macOS)">Firefox 130 (macOS)</option>
                    <option value="Safari 17 (macOS)">Safari 17 (macOS)</option>
                    <option value="Edge 128 (Windows)">Edge 128 (Windows)</option>
                    <option value="Mobile Chrome (Android 14)">Mobile Chrome (Android 14)</option>
                    <option value="Mobile Safari (iOS 18)">Mobile Safari (iOS 18)</option>
                  </select>
                </div>
              </div>

              {/* Selection Mode Selector */}
              <div className="form-group" style={{ marginTop: 8 }}>
                <label>Test Case Selection Strategy</label>
                <div className="selection-tabs">
                  <button
                    type="button"
                    className={`selection-tab-btn ${selectionMode === 'folders' ? 'active' : ''}`}
                    onClick={() => setSelectionMode('folders')}
                  >
                    <Layers size={14} /> Select by Folders / Suites ({projectSuites.length})
                  </button>
                  <button
                    type="button"
                    className={`selection-tab-btn ${selectionMode === 'cases' ? 'active' : ''}`}
                    onClick={() => setSelectionMode('cases')}
                  >
                    <FileText size={14} /> Select Specific Cases ({projectCases.length})
                  </button>
                  <button
                    type="button"
                    className={`selection-tab-btn ${selectionMode === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectionMode('all')}
                  >
                    <CheckSquare size={14} /> All Project Cases ({projectCases.length})
                  </button>
                </div>
              </div>

              {/* Strategy 1: Folders / Suites selector */}
              {selectionMode === 'folders' && (
                <div className="selection-panel">
                  <div className="selection-header">
                    <span>Select Suites / Folders to include:</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (selectedFolderIds.length === projectSuites.length) setSelectedFolderIds([]);
                        else setSelectedFolderIds(projectSuites.map((s) => s.id));
                      }}
                    >
                      {selectedFolderIds.length === projectSuites.length ? 'Deselect all' : 'Select all folders'}
                    </button>
                  </div>
                  <div className="folder-checkbox-grid">
                    {projectSuites.map((suite) => {
                      const count = projectCases.filter((c) => c.suite_id === suite.id).length;
                      const isChecked = selectedFolderIds.includes(suite.id);
                      return (
                        <label key={suite.id} className={`folder-check-item ${isChecked ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedFolderIds([...selectedFolderIds, suite.id]);
                              else setSelectedFolderIds(selectedFolderIds.filter((id) => id !== suite.id));
                            }}
                          />
                          <div className="folder-check-info">
                            <strong>{suite.name}</strong>
                            <span>{count} test cases</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Strategy 2: Specific cases selector */}
              {selectionMode === 'cases' && (
                <div className="selection-panel">
                  <div className="selection-header">
                    <span>Select individual test cases:</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (selectedCaseIds.length === projectCases.length) setSelectedCaseIds([]);
                        else setSelectedCaseIds(projectCases.map((c) => c.id));
                      }}
                    >
                      {selectedCaseIds.length === projectCases.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="case-checkbox-list">
                    {projectCases.map((tc) => {
                      const isChecked = selectedCaseIds.includes(tc.id);
                      return (
                        <label key={tc.id} className={`case-check-row ${isChecked ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedCaseIds([...selectedCaseIds, tc.id]);
                              else setSelectedCaseIds(selectedCaseIds.filter((id) => id !== tc.id));
                            }}
                          />
                          <span className="case-id-tag">{tc.id}</span>
                          <span className="case-title-text">{tc.title}</span>
                          <span className={`priority-tag p-${(tc.priority || 'medium').toLowerCase()}`}>{tc.priority}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Strategy 3: All cases */}
              {selectionMode === 'all' && (
                <div className="selection-panel" style={{ padding: '20px', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#94a3b8' }}>
                    All <strong>{projectCases.length}</strong> test cases in this project will be added to this run.
                  </p>
                </div>
              )}

              {/* Selection Summary Pill */}
              <div className="selection-summary-bar">
                <span>Total cases selected for this run:</span>
                <strong className="badge-highlight">{calculatedCasesForCreate.length} test cases</strong>
              </div>

              <div className="modal-actions" style={{ marginTop: 24 }}>
                <button type="button" className="button button-quiet" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={createBusy || calculatedCasesForCreate.length === 0}
                >
                  {createBusy ? 'Creating Run...' : 'Create Manual Run'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXECUTION WORKSPACE DRAWER / MODAL */}
      {executingRun && (
        <div className="modal-backdrop" onClick={() => setExecutingRun(null)}>
          <div className="execution-workspace" onClick={(e) => e.stopPropagation()}>
            {/* Drawer Top Header */}
            <div className="exec-header">
              <div className="exec-header-left">
                <span className="exec-run-badge">{executingRun.id}</span>
                <h2>{executingRun.name}</h2>
                <span className="exec-meta">
                  {executingRun.environment} &bull; {executingRun.assigned_to || 'QA'}
                </span>
              </div>
              <div className="exec-header-right">
                <div className="exec-progress-summary">
                  <span>{executingRun.percent || 0}% Complete</span>
                  <div className="progress-bar-small">
                    <div style={{ width: `${executingRun.percent || 0}%` }} />
                  </div>
                </div>
                <button className="icon-button" onClick={() => setExecutingRun(null)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Split View: Left List, Right Test Runner */}
            <div className="exec-split-body">
              {/* Left sidebar: Cases in this run */}
              <div className="exec-cases-sidebar">
                <div className="exec-sidebar-heading">
                  <span>TEST CASES ({executingRun.executions?.length || 0})</span>
                </div>
                <div className="exec-cases-scroll">
                  {(executingRun.executions || []).map((exec, idx) => {
                    const tc = exec.case_snapshot || pick(data.cases, exec.case_id) || {};
                    const isActive = idx === activeExecCaseIndex;
                    return (
                      <div
                        key={exec.id}
                        className={`exec-case-item ${isActive ? 'active' : ''}`}
                        onClick={() => handleSelectExecCase(idx)}
                      >
                        <div className="exec-item-status-icon">
                          {exec.status === 'Passed' && <CheckCircle2 size={16} className="text-success" />}
                          {exec.status === 'Failed' && <XCircle size={16} className="text-danger" />}
                          {exec.status === 'Blocked' && <AlertTriangle size={16} className="text-warning" />}
                          {exec.status === 'Skipped' && <Clock size={16} className="text-muted" />}
                          {exec.status === 'Not Run' && <div className="status-dot-empty" />}
                        </div>
                        <div className="exec-item-info">
                          <span className="exec-item-title">{tc.title || exec.case_id}</span>
                          <div className="exec-item-sub">
                            <span className="exec-item-id">{exec.case_id}</span>
                            {exec.jira_ticket && (
                              <span className="jira-chip-small">{exec.jira_ticket}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right panel: Active Test Execution */}
              <div className="exec-main-runner">
                {currentExec ? (
                  <div className="runner-content">
                    {/* Test Info Header */}
                    <div className="runner-case-head">
                      <div>
                        <div className="runner-tag-row">
                          <span className="case-id-pill">{currentExec.case_id}</span>
                          <span className={`status-pill ${statusClass(currentExec.status)}`}>
                            {currentExec.status}
                          </span>
                          {currentExec.jira_ticket && (
                            <a
                              href={currentProject?.jira_url ? `${currentProject.jira_url}/browse/${currentExec.jira_ticket}` : '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="jira-link-badge"
                            >
                              <ExternalLink size={12} /> {currentExec.jira_ticket}
                            </a>
                          )}
                        </div>
                        <h3>{currentExec.case_snapshot?.title || pick(data.cases, currentExec.case_id)?.title}</h3>
                      </div>

                      {/* Quick Case Status Buttons */}
                      <div className="status-action-bar">
                        <button
                          type="button"
                          className={`btn-status btn-pass ${currentExec.status === 'Passed' ? 'selected' : ''}`}
                          onClick={() => handleUpdateExecution('Passed')}
                          disabled={execBusy}
                        >
                          <Check size={16} /> Passed
                        </button>
                        <button
                          type="button"
                          className={`btn-status btn-fail ${currentExec.status === 'Failed' ? 'selected' : ''}`}
                          onClick={() => handleUpdateExecution('Failed')}
                          disabled={execBusy}
                        >
                          <X size={16} /> Failed
                        </button>
                        <button
                          type="button"
                          className={`btn-status btn-block ${currentExec.status === 'Blocked' ? 'selected' : ''}`}
                          onClick={() => handleUpdateExecution('Blocked')}
                          disabled={execBusy}
                        >
                          <AlertTriangle size={15} /> Blocked
                        </button>
                        <button
                          type="button"
                          className={`btn-status btn-skip ${currentExec.status === 'Skipped' ? 'selected' : ''}`}
                          onClick={() => handleUpdateExecution('Skipped')}
                          disabled={execBusy}
                        >
                          <Clock size={15} /> Skipped
                        </button>
                      </div>
                    </div>

                    {/* Preconditions & Test Data */}
                    {currentExec.case_snapshot?.preconditions && (
                      <div className="runner-section">
                        <h4>Preconditions</h4>
                        <div className="runner-box">{currentExec.case_snapshot.preconditions}</div>
                      </div>
                    )}

                    {/* Test Steps with Individual Status */}
                    <div className="runner-section">
                      <h4>Test Steps ({currentExec.steps?.length || 0})</h4>
                      <div className="runner-steps-list">
                        {(currentExec.steps || []).map((step) => {
                          return (
                            <div key={step.id} className="runner-step-row">
                              <div className="step-num-badge">#{step.step_number}</div>
                              <div className="step-content-area">
                                <div className="step-action-text">
                                  <strong>Action:</strong> {step.step_snapshot?.action || step.action || 'Perform step'}
                                </div>
                                <div className="step-expected-text">
                                  <strong>Expected Result:</strong> {step.step_snapshot?.expected_result || step.expected_result || 'Expected behavior occurs'}
                                </div>
                                {step.step_snapshot?.test_data && (
                                  <div className="step-data-text">
                                    <strong>Test Data:</strong> <code>{step.step_snapshot.test_data}</code>
                                  </div>
                                )}
                              </div>
                              <div className="step-status-buttons">
                                <button
                                  className={`step-btn ${step.status === 'Passed' ? 'pass-active' : ''}`}
                                  onClick={() => handleUpdateStep(step, 'Passed')}
                                  title="Mark step passed"
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  className={`step-btn ${step.status === 'Failed' ? 'fail-active' : ''}`}
                                  onClick={() => handleUpdateStep(step, 'Failed')}
                                  title="Mark step failed"
                                >
                                  <X size={13} />
                                </button>
                                <button
                                  className={`step-btn ${step.status === 'Blocked' ? 'block-active' : ''}`}
                                  onClick={() => handleUpdateStep(step, 'Blocked')}
                                  title="Mark step blocked"
                                >
                                  <AlertTriangle size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* FAILURE & JIRA LOGGING SECTION (User Request #1) */}
                    <div className="runner-section jira-feedback-box">
                      <div className="section-title-with-badge">
                        <h4>Jira Integration & Execution Comments</h4>
                        <span className="subtle-tip">Add Jira ticket when marking Failed</span>
                      </div>

                      <div className="form-row-2">
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Jira Ticket Key / Link</label>
                          <input
                            type="text"
                            placeholder="e.g. AJG-2041 or https://jira.company.com/browse/AJG-2041"
                            value={jiraInput}
                            onChange={(e) => setJiraInput(e.target.value)}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Execution Notes / Failure Details</label>
                          <input
                            type="text"
                            placeholder="e.g. 500 error returned when clicking Checkout button"
                            value={commentInput}
                            onChange={(e) => setCommentInput(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button
                          type="button"
                          className="button button-small button-outline"
                          onClick={() => handleUpdateExecution(currentExec.status)}
                          disabled={execBusy}
                        >
                          Save Jira & Notes
                        </button>
                        <button
                          type="button"
                          className="button button-small button-primary"
                          style={{ background: '#ef4444', borderColor: '#ef4444' }}
                          onClick={() => handleUpdateExecution('Failed')}
                          disabled={execBusy}
                        >
                          <X size={14} /> Mark as Failed with Jira Ticket
                        </button>
                      </div>
                    </div>

                    {/* Navigation between cases */}
                    <div className="runner-footer-nav">
                      <button
                        type="button"
                        className="button button-quiet"
                        disabled={activeExecCaseIndex === 0}
                        onClick={() => handleSelectExecCase(activeExecCaseIndex - 1)}
                      >
                        &larr; Previous Case
                      </button>
                      <span className="runner-nav-counter">
                        Test <strong>{activeExecCaseIndex + 1}</strong> of <strong>{executingRun.executions?.length || 0}</strong>
                      </span>
                      <button
                        type="button"
                        className="button button-quiet"
                        disabled={activeExecCaseIndex >= (executingRun.executions?.length || 0) - 1}
                        onClick={() => handleSelectExecCase(activeExecCaseIndex + 1)}
                      >
                        Next Case &rarr;
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <FileText size={32} />
                    <span>Select a test case from the left list to execute</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

