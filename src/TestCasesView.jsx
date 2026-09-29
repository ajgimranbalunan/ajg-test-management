import React, { useState, useMemo } from 'react';
import {
  Folder, FolderPlus, Plus, Search, ChevronRight, ChevronDown, Check,
  X, Edit2, Trash2, Copy, Filter, SlidersHorizontal, FileText, ExternalLink, Sparkles,
  Layers, Tag, User, AlertCircle, ArrowRight
} from 'lucide-react';

const toLabel = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const pick = (items, id) => items.find((item) => item.id === id);
const statusClass = (value = 'Not Run') => value.toLowerCase().replaceAll(' ', '-').replaceAll('/', '-');

export function TestCasesView({
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
  const [selectedSuiteId, setSelectedSuiteId] = useState('ALL'); // 'ALL' or suite_id
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [activeCustomView, setActiveCustomView] = useState('ALL'); // 'ALL' | 'REGRESSION' | 'SMOKE' | 'UI' | customViewId
  const [repositoryTab, setRepositoryTab] = useState('Repository');
  const [collapsedSuiteIds, setCollapsedSuiteIds] = useState([]);
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [duplicateModalCase, setDuplicateModalCase] = useState(null);

  // Project-scoped data
  const currentProject = pick(data.projects, projectId);
  const projectSuites = useMemo(() => data.suites.filter((s) => s.project_id === projectId), [data.suites, projectId]);
  const projectCases = useMemo(() => data.cases.filter((c) => c.project_id === projectId), [data.cases, projectId]);
  const customViews = useMemo(() => (data.custom_views || []).filter((v) => v.project_id === projectId), [data.custom_views, projectId]);
  const suiteChildren = useMemo(() => projectSuites.reduce((groups, suite) => {
    const parentId = suite.parent_id || 'ROOT';
    groups[parentId] = [...(groups[parentId] || []), suite];
    return groups;
  }, {}), [projectSuites]);

  // Current selected suite object
  const selectedSuite = selectedSuiteId === 'ALL' ? null : pick(projectSuites, selectedSuiteId);

  const toggleSuite = (suiteId) => {
    setCollapsedSuiteIds((current) => current.includes(suiteId)
      ? current.filter((id) => id !== suiteId)
      : [...current, suiteId]);
  };

  const descendantCaseCount = (suiteId) => {
    const childSuites = suiteChildren[suiteId] || [];
    return childSuites.reduce((total, child) => total + projectCases.filter((testCase) => testCase.suite_id === child.id).length + descendantCaseCount(child.id), 0);
  };

  const renderSuite = (suite, depth = 0) => {
    const children = suiteChildren[suite.id] || [];
    const isCollapsed = collapsedSuiteIds.includes(suite.id);
    const ownCaseCount = projectCases.filter((testCase) => testCase.suite_id === suite.id).length;
    const totalCaseCount = ownCaseCount + descendantCaseCount(suite.id);
    return (
      <React.Fragment key={suite.id}>
        <div
          className={`folder-row ${selectedSuiteId === suite.id ? 'active' : ''}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => setSelectedSuiteId(suite.id)}
        >
          <button
            type="button"
            className={`folder-toggle ${children.length ? '' : 'empty'}`}
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${suite.name}`}
            onClick={(event) => { event.stopPropagation(); if (children.length) toggleSuite(suite.id); }}
          >
            {children.length > 0 && (isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />)}
          </button>
          <Folder size={14} className="folder-icon text-blue" />
          <span className="folder-name" title={suite.name}>{suite.name}</span>
          <span className="folder-count">{ownCaseCount}{children.length ? `(${totalCaseCount})` : ''}</span>
          <div className="folder-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="folder-action-btn"
              title="Edit folder"
              onClick={() => openModal('suite_edit', { suite })}
            >
              <Edit2 size={11} />
            </button>
            <button
              className="folder-action-btn text-danger"
              title="Delete folder"
              onClick={() => handleDeleteSuite(suite)}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
        {!isCollapsed && children.map((child) => renderSuite(child, depth + 1))}
      </React.Fragment>
    );
  };

  // Filter cases based on suite, custom view, and search query
  const filteredCases = useMemo(() => {
    return projectCases.filter((tc) => {
      // 1. Suite filter
      if (selectedSuiteId !== 'ALL' && tc.suite_id !== selectedSuiteId) {
        return false;
      }
      // 2. Custom View filter
      if (activeCustomView === 'REGRESSION') {
        const tags = (tc.tags || '').toLowerCase();
        if (!tags.includes('regression') && tc.test_type !== 'Regression') return false;
      } else if (activeCustomView === 'SMOKE') {
        const tags = (tc.tags || '').toLowerCase();
        if (!tags.includes('smoke') && tc.test_type !== 'Smoke') return false;
      } else if (activeCustomView === 'UI') {
        const tags = (tc.tags || '').toLowerCase();
        if (!tags.includes('ui') && tc.test_type !== 'UI') return false;
      } else if (activeCustomView !== 'ALL') {
        // user-saved custom view
        const cv = pick(customViews, activeCustomView);
        if (cv && cv.filters) {
          try {
            const f = typeof cv.filters === 'string' ? JSON.parse(cv.filters) : cv.filters;
            if (f.priority && tc.priority !== f.priority) return false;
            if (f.tag && !(tc.tags || '').toLowerCase().includes(f.tag.toLowerCase())) return false;
            if (f.suite_id && tc.suite_id !== f.suite_id) return false;
          } catch (_) {}
        }
      }
      // 3. Search query
      if (searchQuery.trim()) {
        const term = searchQuery.trim().toLowerCase();
        const matches = tc.title.toLowerCase().includes(term) ||
          tc.id.toLowerCase().includes(term) ||
          (tc.tags || '').toLowerCase().includes(term) ||
          (tc.created_by || '').toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [projectCases, selectedSuiteId, activeCustomView, searchQuery, customViews]);

  // Quick inline test case creation
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    setQuickBusy(true);
    try {
      const suiteIdToUse = selectedSuiteId !== 'ALL' ? selectedSuiteId : (projectSuites[0]?.id || null);
      await request('/cases', {
        method: 'POST',
        body: JSON.stringify({
          title: quickTitle.trim(),
          project_id: projectId,
          suite_id: suiteIdToUse,
          plan_id: selectedSuite?.plan_id || null,
          priority: 'Medium',
          test_type: 'Functional',
          status: 'Draft',
          created_by: currentUser?.name || role || 'QA Admin',
          steps: [{ action: quickTitle.trim(), test_data: '', expected_result: 'Verify expected behavior.' }],
        }),
      });
      await refresh();
      setQuickTitle('');
      announce('Test case created');
    } catch (err) {
      announce(err.message);
    } finally {
      setQuickBusy(false);
    }
  };

  // Quick folder/suite creation
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await request('/suites', {
        method: 'POST',
        body: JSON.stringify({
          name: newFolderName.trim(),
          project_id: projectId,
          owner: currentUser?.name || role || 'QA Admin',
          created_by: currentUser?.name || role || 'QA Admin',
        }),
      });
      await refresh();
      setNewFolderName('');
      setShowNewFolderInput(false);
      announce('Folder created');
    } catch (err) {
      announce(err.message);
    }
  };

  // Duplicate a test case
  const handleDuplicate = async (targetSuiteId, extraTags) => {
    if (!duplicateModalCase) return;
    try {
      await request(`/cases/${encodeURIComponent(duplicateModalCase.id)}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({
          title: `${duplicateModalCase.title} (Copy)`,
          suite_id: targetSuiteId || duplicateModalCase.suite_id,
          tags: extraTags !== undefined ? `${duplicateModalCase.tags || ''} ${extraTags}`.trim() : duplicateModalCase.tags,
          created_by: currentUser?.name || role || 'QA Admin',
        }),
      });
      await refresh();
      setDuplicateModalCase(null);
      announce('Test case duplicated');
    } catch (err) {
      announce(err.message);
    }
  };

  // Delete test case
  const handleDeleteCase = (tc) => {
    openModal('confirm_delete', {
      resource: 'cases',
      id: tc.id,
      title: `Delete Test Case "${tc.id}"`,
      message: `Are you sure you want to delete ${tc.id}: "${tc.title}"?`,
      onConfirm: async () => {
        try {
          await request(`/cases/${encodeURIComponent(tc.id)}`, { method: 'DELETE' });
          await refresh();
          announce('Test case deleted');
        } catch (err) {
          announce(err.message);
        }
      },
    });
  };

  // Delete suite/folder
  const handleDeleteSuite = (suite) => {
    openModal('confirm_delete', {
      resource: 'suites',
      id: suite.id,
      title: `Delete Folder "${suite.name}"`,
      message: `Are you sure you want to delete folder "${suite.name}"? Test cases inside will be deleted.`,
      onConfirm: async () => {
        try {
          await request(`/suites/${encodeURIComponent(suite.id)}`, { method: 'DELETE' });
          await refresh();
          if (selectedSuiteId === suite.id) setSelectedSuiteId('ALL');
          announce('Folder deleted');
        } catch (err) {
          announce(err.message);
        }
      },
    });
  };

  return (
    <div className="test-cases-repository-view">
      <div className="page-heading bs-page-header">
        <div>
          <div className="eyebrow">
            PROJECT: <strong>{currentProject?.name || 'SELECT A PROJECT'}</strong> ({currentProject?.id || '—'})
          </div>
          <h1>Test Cases</h1>
        </div>
        <div className="heading-actions">
          <button
            className="button button-primary"
            onClick={() => openModal('case', { project_id: projectId, suite_id: selectedSuiteId !== 'ALL' ? selectedSuiteId : undefined })}
          >
            <Plus size={15} /> Create Test Case
          </button>
        </div>
      </div>

      <div className="repository-tabs" role="tablist" aria-label="Test case workspace sections">
        {['Repository', 'Shared Fields', 'Datasets', 'LCA Status'].map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={repositoryTab === tab}
            className={`repository-tab ${repositoryTab === tab ? 'active' : ''}`}
            onClick={() => {
              setRepositoryTab(tab);
              if (tab !== 'Repository') announce(`${tab} is available for this project.`);
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Two-Column Repository Workspace (BrowserStack Layout) */}
      <div className="repository-layout">
        {/* LEFT COLUMN: Folders / Test Suites Tree */}
        <aside className="folders-sidebar">
          <div className="folders-header">
            <div className="folders-title">
              <Folder size={15} className="text-blue" />
              <strong>Folders / Suites</strong>
              <span className="count-pill">{projectCases.length}</span>
            </div>
            <button
              className="icon-button"
              title="Add New Folder / Suite"
              onClick={() => setShowNewFolderInput((prev) => !prev)}
            >
              <FolderPlus size={14} />
            </button>
          </div>

          {/* Quick inline folder creation input */}
          {showNewFolderInput && (
            <form onSubmit={handleCreateFolder} className="new-folder-form">
              <input
                autoFocus
                placeholder="Folder name (e.g. Authentication)…"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <button type="submit" className="button button-primary btn-compact">Add</button>
              <button type="button" className="button button-quiet btn-compact" onClick={() => setShowNewFolderInput(false)}>✕</button>
            </form>
          )}

          {/* Suites Navigation List */}
          <div className="folders-tree-list">
            {/* "All Test Cases" Top Option */}
            <button
              className={`folder-item ${selectedSuiteId === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedSuiteId('ALL')}
            >
              <Layers size={14} className="folder-icon" />
              <span className="folder-name">All Test Cases</span>
              <span className="folder-count">{projectCases.length}</span>
            </button>

            {/* Project Suites */}
            {(suiteChildren.ROOT || []).map((suite) => renderSuite(suite))}

            {projectSuites.length === 0 && (
              <div className="empty-folders-hint">
                No folders yet. Click "+" above to create a test suite/folder.
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: Test Cases Table & View Controls */}
        <section className="cases-main-content">
          <div className="repository-controlbar">
            <div className="repository-control-left">
              <span className="case-count-label">{filteredCases.length} test cases</span>
              <button type="button" className="control-button" onClick={() => announce('Cases are currently sorted by custom order.')}>
                <SlidersHorizontal size={13} /> Sort: Custom
              </button>
              <button type="button" className="control-button icon-only" title="Create a folder" onClick={() => setShowNewFolderInput(true)}>
                <FolderPlus size={15} />
              </button>
            </div>
            <button type="button" className="control-button review-button" onClick={() => announce('Review duplicate cases from the duplicate action on each case.')}>
              <Sparkles size={14} /> Review duplicates
            </button>
          </div>
          {/* Top Bar: View Selector, Breadcrumbs, Search */}
          <div className="cases-top-toolbar">
            {/* View Selector & Breadcrumb */}
            <div className="view-selector-group">
              <label className="view-dropdown-label">
                <SlidersHorizontal size={13} />
                <select
                  value={activeCustomView}
                  onChange={(e) => {
                    if (e.target.value === '__CREATE_NEW__') {
                      setShowCreateViewModal(true);
                    } else {
                      setActiveCustomView(e.target.value);
                    }
                  }}
                >
                  <option value="ALL">All Test Cases</option>
                  <option value="REGRESSION">View: Regression Tests (@regression)</option>
                  <option value="SMOKE">View: Smoke Tests (@smoke)</option>
                  <option value="UI">View: UI Tests (@ui)</option>
                  {customViews.map((cv) => (
                    <option key={cv.id} value={cv.id}>View: {cv.name}</option>
                  ))}
                  <option value="__CREATE_NEW__">+ Create New View…</option>
                </select>
                <ChevronDown size={12} />
              </label>

              <span className="crumb-divider">/</span>
              <span className="cases-breadcrumb-text">
                {selectedSuite ? selectedSuite.name : 'All Folders'}
              </span>
            </div>

            {/* Search Input */}
            <div className="cases-search-box">
              <Search size={14} />
              <input
                placeholder="Search by Test Case ID or Title…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>
          </div>

          {/* Quick Inline Test Case Creator (as in BrowserStack screenshot) */}
          <form className="quick-add-case-bar" onSubmit={handleQuickAdd}>
            <span className="quick-type-tag">Manual ▾</span>
            <input
              type="text"
              placeholder={selectedSuite ? `Enter test case title for "${selectedSuite.name}"…` : 'Enter test case title…'}
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              disabled={quickBusy}
            />
            <button
              type="submit"
              className="button button-primary btn-compact"
              disabled={quickBusy || !quickTitle.trim()}
            >
              {quickBusy ? 'Adding…' : 'Create'}
            </button>
          </form>

          {/* Test Cases Table */}
          <div className="table-panel cases-table-panel">
            <table>
              <thead>
                <tr>
                  <th className="check-column">
                    <input
                      type="checkbox"
                      checked={filteredCases.length > 0 && selectedCaseIds.length === filteredCases.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedCaseIds(filteredCases.map((c) => c.id));
                        else setSelectedCaseIds([]);
                      }}
                    />
                  </th>
                  <th style={{ width: 85 }}>ID</th>
                  <th>Title</th>
                  <th style={{ width: 100 }}>Priority</th>
                  <th style={{ width: 140 }}>Owner / Created By</th>
                  <th style={{ width: 130 }}>Tags</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((tc) => {
                  const isChecked = selectedCaseIds.includes(tc.id);
                  const creatorName = tc.created_by || tc.assigned_to || 'QA Admin';
                  const initials = creatorName.split(' ').map((p) => p[0]).slice(0, 2).join('');
                  const tagsList = String(tc.tags || '').split(' ').filter(Boolean);

                  return (
                    <tr key={tc.id} className={isChecked ? 'row-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedCaseIds([...selectedCaseIds, tc.id]);
                            else setSelectedCaseIds(selectedCaseIds.filter((id) => id !== tc.id));
                          }}
                        />
                      </td>
                      <td>
                        <span className="record-id">{tc.id}</span>
                      </td>
                      <td>
                        <button
                          className="link-title-btn"
                          onClick={() => openModal('case_edit', { testCase: tc })}
                          title="Click to view and edit test steps"
                        >
                          <strong>{tc.title}</strong>
                        </button>
                      </td>
                      <td>
                        <span className={`status-pill ${statusClass(tc.priority)}`}>
                          {tc.priority || 'Medium'}
                        </span>
                      </td>
                      <td>
                        <div className="owner-chip">
                          <span className="owner-avatar">{initials}</span>
                          <span className="owner-name" title={creatorName}>{creatorName}</span>
                        </div>
                      </td>
                      <td>
                        <div className="tag-list">
                          {tagsList.slice(0, 2).map((tag) => (
                            <span key={tag} className="tag-chip">{tag}</span>
                          ))}
                          {tagsList.length > 2 && (
                            <span className="tag-more">+{tagsList.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="table-actions-cell">
                          <button
                            className="icon-button"
                            title="Duplicate test case (to Regression, UI, etc.)"
                            onClick={() => setDuplicateModalCase(tc)}
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            className="icon-button"
                            title="Edit test case"
                            onClick={() => openModal('case_edit', { testCase: tc })}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="icon-button text-danger"
                            title="Delete test case"
                            onClick={() => handleDeleteCase(tc)}
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

            {filteredCases.length === 0 && (
              <div className="empty-state">
                <FileText size={26} />
                <strong>No test cases found</strong>
                <span>
                  {searchQuery
                    ? 'No cases match your search.'
                    : selectedSuiteId !== 'ALL'
                    ? `No test cases in "${selectedSuite?.name}". Type above to add one!`
                    : 'Get started by creating your first test case above.'}
                </span>
              </div>
            )}

            <div className="table-footer">
              <span>Showing <strong>{filteredCases.length}</strong> of <strong>{projectCases.length}</strong> test cases</span>
              <span>{currentProject?.name}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Duplicate Test Case Modal */}
      {duplicateModalCase && (
        <DuplicateModal
          testCase={duplicateModalCase}
          suites={projectSuites}
          onDuplicate={handleDuplicate}
          onClose={() => setDuplicateModalCase(null)}
        />
      )}

      {/* Create Custom View Modal (Screenshot 3) */}
      {showCreateViewModal && (
        <CreateViewModal
          projectId={projectId}
          suites={projectSuites}
          currentUser={currentUser}
          request={request}
          refresh={refresh}
          onClose={() => setShowCreateViewModal(false)}
          announce={announce}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// DUPLICATE TEST CASE MODAL
// ----------------------------------------------------------------------------
function DuplicateModal({ testCase, suites, onDuplicate, onClose }) {
  const [targetSuiteId, setTargetSuiteId] = useState(testCase.suite_id || '');
  const [extraTag, setExtraTag] = useState('@regression');

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">DUPLICATE TEST CASE</span>
            <h2>Duplicate {testCase.id}</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#44564c' }}>
            Duplicate <strong>"{testCase.title}"</strong> and optionally assign it to another suite or add tags (e.g. <code>@regression</code>, <code>@ui</code>, <code>@smoke</code>):
          </p>

          <label className="form-field" style={{ marginBottom: 12 }}>
            <span>TARGET SUITE / FOLDER</span>
            <select value={targetSuiteId} onChange={(e) => setTargetSuiteId(e.target.value)}>
              <option value="">Keep in current suite</option>
              {suites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>ADDITIONAL TAGS</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={extraTag}
                onChange={(e) => setExtraTag(e.target.value)}
                placeholder="e.g. @regression @ui"
              />
              <button
                type="button"
                className="button button-quiet btn-compact"
                onClick={() => setExtraTag('@regression')}
              >
                + @regression
              </button>
              <button
                type="button"
                className="button button-quiet btn-compact"
                onClick={() => setExtraTag('@ui')}
              >
                + @ui
              </button>
            </div>
          </label>
        </div>
        <div className="dialog-footer">
          <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onDuplicate(targetSuiteId, extraTag)}
          >
            Duplicate Test Case
          </button>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CREATE VIEW MODAL (BrowserStack Screenshot 3)
// ----------------------------------------------------------------------------
function CreateViewModal({ projectId, suites, currentUser, request, refresh, onClose, announce }) {
  const [viewName, setViewName] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterSuiteId, setFilterSuiteId] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!viewName.trim()) return;
    setBusy(true);
    try {
      const filters = {
        priority: filterPriority || undefined,
        tag: filterTag || undefined,
        suite_id: filterSuiteId || undefined,
      };
      await request('/views', {
        method: 'POST',
        body: JSON.stringify({
          name: viewName.trim(),
          project_id: projectId,
          filters: JSON.stringify(filters),
          created_by: currentUser?.name || 'QA Admin',
        }),
      });
      await refresh();
      announce(`View "${viewName}" created`);
      onClose();
    } catch (err) {
      announce(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: 460 }}>
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">CUSTOM VIEWS</span>
            <h2>Create View</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '16px 20px', display: 'grid', gap: 12 }}>
            <label className="form-field">
              <span>ENTER VIEW NAME *</span>
              <input
                required
                placeholder="e.g. Regression Suite, UI Tests, Criticals…"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
              />
            </label>

            <label className="form-field">
              <span>FILTER BY FOLDER / SUITE</span>
              <select value={filterSuiteId} onChange={(e) => setFilterSuiteId(e.target.value)}>
                <option value="">All Folders</option>
                {suites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>FILTER BY PRIORITY</span>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                <option value="">All Priorities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>

            <label className="form-field">
              <span>FILTER BY TAG</span>
              <input
                placeholder="e.g. regression, smoke, ui…"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
              />
            </label>
          </div>
          <div className="dialog-footer">
            <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy || !viewName.trim()}>
              {busy ? 'Saving…' : 'Save View'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}


