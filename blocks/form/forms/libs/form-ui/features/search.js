import { render, html } from 'da-lit';
import { inputNameToPointer, findModelNodeByPointer } from '../form-model/path-utils.js';
import { arrayItemId } from '../form-generator/path-utils.js';

/**
 * FormSearch
 * Lightweight, isolated search palette to find form groups by name and navigate to them.
 * Activation: Ctrl/Cmd+K
 */
export default class FormSearch {
  constructor(context, formGenerator) {
    this.context = context;
    this.formGenerator = formGenerator;
    this._keydown = this._keydown.bind(this);
    this._onInput = this._onInput.bind(this);
    this._onKeyNav = this._onKeyNav.bind(this);
    this._onClickResult = this._onClickResult.bind(this);
    this._onBadgeEnter = this._onBadgeEnter.bind(this);
    this._onBadgeLeave = this._onBadgeLeave.bind(this);
    this._onBadgeClick = this._onBadgeClick.bind(this);
    this._container = null;
    this._input = null;
    this._resultsEl = null;
    this._results = [];
    this._selected = -1;
    this._index = [];
    this._lastQuery = '';
    this._pinned = new Set();
    this._displayList = [];
    this._activeTab = 'search';
    this._lastSelectedGroupId = '';
    this._confirmResetPinned = false;
    this._confirmTimer = null;
    this._isIndexing = false;
    this._lastGroupSig = '';
    this._hideOptional = false;
  }

  init() {
    // Preload stylesheet early to avoid layout flicker on first open
    try {
      if (!document.getElementById('form-search-styles')) {
        const link = document.createElement('link');
        link.id = 'form-search-styles';
        link.rel = 'stylesheet';
        link.href = new URL('../styles/form-ui.search.css', import.meta.url).href;
        document.head.appendChild(link);
      }
    } catch { }
    // Build index on init; refresh on rebuilds by listening to generator refreshNavigation
    this._loadPinned();
    this._buildIndex();
    window.addEventListener('keydown', this._keydown);
    // External state setter will control _hideOptional; no DOM coupling here
    // Reindex only when group topology changes; otherwise refresh statuses
    this._debounceTimer = null;
    this.formGenerator.onChange(() => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        const sig = this._computeGroupSignature();
        if (sig && sig !== this._lastGroupSig) {
          try { console.log('[search] onChange: topology changed -> rebuild index'); } catch { }
          this._buildIndex();
        } else {
          try { console.log('[search] onChange: topology unchanged -> refresh statuses'); } catch { }
          this._refreshStatuses();
          if (this._container && this._input) {
            const q = this._input.value || '';
            this._onInput({ target: { value: q } });
          }
        }
      }, 80);
    });
    // Hook into existing rebuild points to keep index fresh
    const originalRefreshNav = this.formGenerator?.groupBuilder?.refreshNavigation;
    if (typeof originalRefreshNav === 'function') {
      this.formGenerator.groupBuilder.refreshNavigation = (...args) => {
        const res = originalRefreshNav.apply(this.formGenerator.groupBuilder, args);
        try { console.log('[search] refreshNavigation -> rebuild index'); this._buildIndex(); } catch { /* noop */ }
        return res;
      };
    }
  }

  destroy() {
    window.removeEventListener('keydown', this._keydown);
    this.close();
  }

  setHideOptional(hide) {
    this._hideOptional = !!hide;
    // If dialog is open, re-filter results immediately to reflect state
    if (this._container && this._input) {
      const q = this._input.value || '';
      this._onInput({ target: { value: q } });
    }
  }

  _keydown(e) {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const meta = isMac ? e.metaKey : e.ctrlKey;
    const keyK = (e.key === 'k' || e.key === 'K');
    if (!meta || !keyK) return;
    e.preventDefault();
    // Ctrl/Cmd+Shift+K → open pinned tab directly
    if (e.shiftKey) {
      if (this._container) {
        this._activeTab = 'pinned';
        this._applyTabUI();
        this._updateResults();
      } else {
        this.open('pinned');
      }
      return;
    }
    // Default Ctrl/Cmd+K → open search tab
    this.open('search');
  }

  open(tab = 'search') {
    if (this._container) return;
    this._renderDialog();
    // Restore last query/results if present
    const last = this._lastQuery || '';
    this._activeTab = (tab === 'pinned') ? 'pinned' : 'search';
    this._applyTabUI();
    if (this._activeTab === 'search' && last && this._input) {
      this._input.value = last;
      this._onInput({ target: { value: last } });
    } else {
      // Show empty results initially on search tab
      this._selected = -1;
      this._results = (this._activeTab === 'pinned') ? [] : [];
      this._updateResults();
    }
    if (this._activeTab === 'search') this._input.focus();
  }

  close() {
    if (!this._container) return;
    try { this._container.remove(); } catch { /* noop */ }
    this._container = null;
    this._input = null;
    this._resultsEl = null;
    this._results = [];
    this._selected = -1;
  }

  _renderDialog() {
    const mount = document.createElement('div');
    render(html`
      <div class="form-search-overlay" @click=${() => this.close()}></div>
      <div class="form-search-dialog" role="dialog" aria-modal="true" @click=${(ev) => ev.stopPropagation()}>
        <div class="form-search-tabs" role="tablist">
          <div class="form-search-tab" data-tab="search" role="tab" tabindex="0" aria-selected="true"
            title="Shortcut: Ctrl/Cmd+K" aria-label="Search (Shortcut: Ctrl or Cmd + K)">Search</div>
          <div class="form-search-tab" data-tab="pinned" role="tab" tabindex="0" aria-selected="false"
            title="Shortcut: Ctrl/Cmd+Shift+K" aria-label="Pinned (Shortcut: Ctrl or Cmd + Shift + K)">Pinned</div>
          <div class="btn-close form-search-close" role="button" tabindex="0" title="Close (Esc)" aria-label="Close"
            @click=${() => this.close()}
            @keydown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.close(); } }}
          ></div>
        </div>
        <input type="text" class="form-search-input" placeholder="Search groups…" @input=${this._onInput} @keydown=${this._onKeyNav}>
        <div class="form-search-results" role="listbox"></div>
      </div>
    `, mount);
    const container = document.createElement('div');
    container.className = 'form-search-container';
    // Inject styles via external stylesheet once
    if (!document.getElementById('form-search-styles')) {
      const link = document.createElement('link');
      link.id = 'form-search-styles';
      link.rel = 'stylesheet';
      link.href = new URL('../styles/form-ui.search.css', import.meta.url).href;
      document.head.appendChild(link);
    }
    container.appendChild(mount);
    document.body.appendChild(container);
    this._container = container;
    this._input = container.querySelector('.form-search-input');
    this._resultsEl = container.querySelector('.form-search-results');
    // Tab handlers
    const tabs = container.querySelectorAll('.form-search-tab');
    const onActivateTab = (el) => {
      const tab = el.getAttribute('data-tab');
      if (!tab) return;
      this._activeTab = tab;
      this._applyTabUI();
      this._updateResults();
      if (this._activeTab === 'search') this._input?.focus();
    };
    tabs.forEach((el) => {
      el.addEventListener('click', () => onActivateTab(el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivateTab(el); }
      });
    });
  }

  _onInput(e) {
    const qRaw = String(e.target.value || '');
    const q = qRaw.trim().toLowerCase();
    this._lastQuery = qRaw;
    const parsed = this._parseQuery(qRaw);
    if (!q) {
      this._results = [];
      this._selected = -1;
      this._updateResults();
      return;
    }
    const orderMap = this._orderByGroupId || new Map();
    const filtered = this._index
      .filter((item) => this._matchesItem(item, parsed))
      .sort((a, b) => {
        const oa = orderMap.has(a.groupId) ? orderMap.get(a.groupId) : Number.MAX_SAFE_INTEGER;
        const ob = orderMap.has(b.groupId) ? orderMap.get(b.groupId) : Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        return this._compareSchemaPath(a.schemaPath, b.schemaPath);
      });
    // Apply optional visibility: when toggle is on, hide inactive optional groups
    this._results = this._hideOptional ? filtered.filter((r) => r.isActive || !r.activatable) : filtered;
    this._selected = this._results.length > 0 ? 0 : -1;
    this._updateResults();
  }

  _onKeyNav(e) {
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    const listLen = (this._displayList && this._displayList.length) ? this._displayList.length : 0;
    if (listLen === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._selected = Math.min(listLen - 1, this._selected + 1);
      this._highlightSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._selected = Math.max(0, this._selected - 1);
      this._highlightSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this._selected >= 0 && this._displayList[this._selected]) this._activate(this._displayList[this._selected]);
    }
  }

  _onClickResult(e) {
    const li = e.target.closest('.form-search-item');
    if (!li) return;
    const gid = li.getAttribute('data-group-id');
    const list = this._displayList && this._displayList.length ? this._displayList : this._results;
    const found = list.find((r) => r.groupId === gid);
    if (found) this._activate(found);
  }

  _highlightSelection() {
    if (!this._resultsEl) return;
    this._resultsEl.querySelectorAll('.form-search-item').forEach((el, idx) => {
      el.setAttribute('aria-selected', String(idx === this._selected));
      if (idx === this._selected) el.scrollIntoView({ block: 'nearest' });
    });
  }

  _activate(item) {
    try { this.formGenerator.navigation.navigateToGroup(item.groupId); } catch { /* noop */ }
    this.close();
  }

  _onBadgeEnter(e) {
    const el = e.currentTarget;
    if (!el) return;
    el.textContent = 'Activate';
    el.classList.add('activate');
  }

  _onBadgeLeave(e) {
    const el = e.currentTarget;
    if (!el) return;
    el.textContent = 'Not activated';
    el.classList.remove('activate');
  }

  _onBadgeClick(e, item) {
    e.preventDefault();
    e.stopPropagation();
    if (!item || !item.schemaPath) return;
    try {
      this.formGenerator.commandActivateOptional(item.schemaPath);
    } catch { /* noop */ }
    // Refresh index and reapply current query after activation
    requestAnimationFrame(() => {
      this._buildIndex();
      const q = this._input ? this._input.value : '';
      this._onInput({ target: { value: q } });
    });
  }

  _updateResults() {
    if (!this._resultsEl) return;
    const hasQuery = !!this._lastQuery;
    const pinnedList = this._getPinnedResults();
    const resultsList = (this._results || []);
    // Decide which list drives keyboard nav based on active tab
    const combined = this._activeTab === 'pinned' ? pinnedList : (hasQuery ? resultsList : []);
    this._displayList = combined;

    // Preserve selection on rebuild: prefer same group id
    if (combined.length > 0) {
      let nextSelected = this._selected;
      if (this._lastSelectedGroupId) {
        const idx = combined.findIndex((e) => e.groupId === this._lastSelectedGroupId);
        if (idx >= 0) nextSelected = idx;
      }
      if (nextSelected < 0 || nextSelected >= combined.length) nextSelected = 0;
      this._selected = nextSelected;
    } else {
      this._selected = -1;
    }

    const headerPinned = (this._activeTab === 'pinned' && pinnedList.length)
      ? html`<div class="form-search-header-row">
          <div class="form-search-section" style="padding:0">Pinned items</div>
          <span class="form-search-reset-link ${this._confirmResetPinned ? 'danger' : ''}"
            role="button" tabindex="0"
            title=${this._confirmResetPinned ? 'Confirm reset of all pinned items' : 'Remove all pinned items'}
            aria-label=${this._confirmResetPinned ? 'Confirm reset of all pinned items' : 'Remove all pinned items'}
            @click=${() => this._handleResetPinnedClick()}
            @keydown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._handleResetPinnedClick(); } }}>
            ${this._confirmResetPinned ? 'Confirm' : 'Reset'}
          </span>
        </div>`
      : html``;
    const headerResults = (this._activeTab === 'search' && hasQuery && resultsList.length)
      ? html`<div class="form-search-section">Results</div>`
      : html``;

    const renderItem = (r, idx) => html`
      <div class="form-search-item" role="option" data-group-id=${r.groupId} aria-selected=${String(idx === this._selected)}>
        <div class="form-search-item-main">
          <span class="form-search-breadcrumb">
            ${r.crumbs.map((label, i) => html`<span class="crumb" data-level=${String(i)}>${label}</span>`)}
          </span>
        </div>
        <div class="form-search-actions">
          ${(!r.isActive && r.activatable)
        ? html`<span class="form-search-status inactive" title="Not activated"
                data-schema-path=${r.schemaPath}
                @mouseenter=${this._onBadgeEnter}
                @mouseleave=${this._onBadgeLeave}
                @click=${(e) => this._onBadgeClick(e, r)}
              >Not activated</span>`
        : (!r.isActive ? html`<span class="form-search-status inactive" title="Not activated">Not activated</span>` : html``)}
          <span class="form-search-pin ${this._pinned.has(r.groupId) ? 'pinned' : ''}"
            title=${this._pinned.has(r.groupId) ? 'Unpin' : 'Pin'}
            aria-label=${this._pinned.has(r.groupId) ? 'Unpin' : 'Pin'}
            @click=${(e) => this._togglePin(e, r.groupId)}
          >★</span>
        </div>
      </div>`;

    const pinnedNodes = (this._activeTab === 'pinned')
      ? (pinnedList.length
        ? pinnedList.map((r, idx) => renderItem(r, idx))
        : [html`<div class="form-search-empty">No pinned items</div>`])
      : [];
    const resultNodes = (this._activeTab === 'search')
      ? (hasQuery
        ? (resultsList.length ? resultsList.map((r, i) => renderItem(r, i)) : [html`<div class="form-search-empty">No search results</div>`])
        : [])
      : [];

    const indexingBanner = this._isIndexing ? html`<div class="form-search-indexing">Indexing groups…</div>` : html``;
    render(html`${indexingBanner}${headerPinned}${pinnedNodes}${headerResults}${resultNodes}`, this._resultsEl);
    this._resultsEl.removeEventListener('click', this._onClickResult);
    this._resultsEl.addEventListener('click', this._onClickResult);
    this._highlightSelection();
  }

  _applyTabUI() {
    if (!this._container) return;
    const searchSelected = this._activeTab === 'search';
    const btnSearch = this._container.querySelector('.form-search-tab[data-tab="search"]');
    const btnPinned = this._container.querySelector('.form-search-tab[data-tab="pinned"]');
    if (btnSearch) btnSearch.setAttribute('aria-selected', String(searchSelected));
    if (btnPinned) btnPinned.setAttribute('aria-selected', String(!searchSelected));
    // Toggle input visibility: only on search tab
    const input = this._container.querySelector('.form-search-input');
    if (input) input.style.display = searchSelected ? '' : 'none';
  }

  _resetPinned() {
    this._pinned.clear();
    this._savePinned();
    this._updateResults();
  }

  _handleResetPinnedClick() {
    if (!this._confirmResetPinned) {
      this._confirmResetPinned = true;
      this._updateResults();
      clearTimeout(this._confirmTimer);
      this._confirmTimer = setTimeout(() => {
        this._confirmResetPinned = false;
        this._updateResults();
      }, 3000);
      return;
    }
    this._confirmResetPinned = false;
    clearTimeout(this._confirmTimer);
    this._resetPinned();
  }

  _buildIndex() {
    this._isIndexing = true;
    try { console.log('[search] buildIndex: start'); } catch { }
    const byPath = new Map(); // schemaPath -> entry (prefer array-item container)
    const groups = this.formGenerator?.groupElements;
    if (!groups || groups.size === 0) { this._index = []; return; }
    let ordinal = 0;
    groups.forEach((info, groupId) => {
      // Skip non-group ids that don't start with our known prefixes
      const isRealGroup = groupId.startsWith('form-group-') || groupId.startsWith('form-array-item-');
      if (!isRealGroup) return;
      let schemaPath = info?.schemaPath || info?.element?.dataset?.schemaPath || '';
      // Fallback: derive schemaPath from groupId when missing (not all renderers populate dataset)
      if (!schemaPath && typeof groupId === 'string') {
        const mItem = groupId.match(/^form-array-item-(.+)-(\d+)$/);
        if (mItem) {
          // groupId encodes hyphenated path; convert back to bracket path
          const hyph = mItem[1];
          const idx = Number(mItem[2]);
          if (!Number.isNaN(idx)) {
            // Reverse hyphenation: hyph -> dot path by replacing '-' with '.' then reapply brackets for index
            const dot = String(hyph).replace(/-/g, '.');
            schemaPath = `${dot}[${idx}]`;
          }
        } else {
          const mGroup = groupId.match(/^form-group-(.+)$/);
          if (mGroup) {
            const hyph = mGroup[1];
            schemaPath = String(hyph).replace(/-/g, '.');
          }
        }
      }
      const crumbs = this._buildBreadcrumbLabels(schemaPath);
      const title = crumbs[crumbs.length - 1] || info?.title || '';
      const pointer = inputNameToPointer(schemaPath || '');
      const modelNode = pointer ? findModelNodeByPointer(this.formGenerator.formUiModel, pointer) : this.formGenerator.formUiModel;
      const isActive = !!(modelNode && modelNode.isActive);
      const activatable = !!(modelNode && modelNode.activatable);
      const entry = {
        groupId,
        schemaPath,
        title,
        titleLc: String(title || '').toLowerCase(),
        crumbs,
        joinedCrumbsLc: crumbs.join(' ').toLowerCase(),
        isActive,
        activatable,
        order: ordinal++,
      };
      const existing = byPath.get(schemaPath);
      if (!existing) {
        byPath.set(schemaPath, entry);
      } else {
        const isCurrentArrayItem = groupId.startsWith('form-array-item-');
        const isExistingArrayItem = existing.groupId.startsWith('form-array-item-');
        // Prefer array item container over nested duplicate groups for same path
        if (isCurrentArrayItem && !isExistingArrayItem) {
          // preserve earliest order when replacing
          entry.order = Math.min(existing.order ?? entry.order, entry.order);
          byPath.set(schemaPath, entry);
        } else if (isCurrentArrayItem === isExistingArrayItem) {
          // If both same type, prefer active over inactive
          if (!!entry.isActive && !existing.isActive) {
            entry.order = Math.min(existing.order ?? entry.order, entry.order);
            byPath.set(schemaPath, entry);
          }
        }
      }
    });
    // Add explicit entries for array items using the FormUiModel (covers cases where groupElements lacks them)
    const currentEntries = Array.from(byPath.values());
    currentEntries.forEach((parent) => {
      const parentPtr = inputNameToPointer(parent.schemaPath || '');
      const parentNode = parentPtr ? findModelNodeByPointer(this.formGenerator.formUiModel, parentPtr) : null;
      if (!parentNode || parentNode.type !== 'array' || !Array.isArray(parentNode.items)) return;
      for (let i = 0; i < parentNode.items.length; i += 1) {
        const childPath = `${parent.schemaPath}[${i}]`;
        if (byPath.has(childPath)) continue;
        const crumbs = this._buildBreadcrumbLabels(childPath);
        const title = crumbs[crumbs.length - 1] || `${parent.title} #${i + 1}`;
        const childNode = parentNode.items[i];
        const entry = {
          groupId: arrayItemId(parent.schemaPath, i),
          schemaPath: childPath,
          title,
          titleLc: String(title || '').toLowerCase(),
          crumbs,
          joinedCrumbsLc: crumbs.join(' ').toLowerCase(),
          isActive: !!(childNode && childNode.isActive),
          activatable: !!(childNode && childNode.activatable),
          order: ordinal++,
        };
        byPath.set(childPath, entry);
      }
    });
    // Ensure root is indexed even if not registered as a group element
    const rootId = this.formGenerator.pathToGroupId('root');
    if (![...byPath.values()].some((e) => e.groupId === rootId)) {
      const modelNode = this.formGenerator.formUiModel; // root node
      const schemaSvc = this.formGenerator?.services?.schema;
      const title = (schemaSvc && schemaSvc.getTitleAtPointer(this.formGenerator.schema, '#', ''))
        || this.formGenerator.schema?.title || 'Form';
      const isActive = !!(modelNode && (modelNode.isActive || modelNode.activatable == null));
      byPath.set('', {
        groupId: rootId,
        schemaPath: '',
        title,
        titleLc: String(title).toLowerCase(),
        crumbs: [title],
        joinedCrumbsLc: String(title).toLowerCase(),
        isActive,
        activatable: false,
      });
    }
    const entries = Array.from(byPath.values());
    // Persist schema/render order by group id for pinned ordering
    this._orderByGroupId = new Map(entries
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((e, i) => [e.groupId, i]));

    this._index = entries
      .sort((a, b) => this._compareSchemaPath(a.schemaPath, b.schemaPath));
    // Debug: log indexed items for verification
    try {
      // Log concise summary of all indexed items
      console.log('[search] buildIndex: indexed', this._index.length, 'items');
      console.log('[search] items', this._index.map((e) => ({ groupId: e.groupId, schemaPath: e.schemaPath, title: e.title, isActive: e.isActive })));
    } catch { }
    this._lastGroupSig = this._computeGroupSignature();
    this._isIndexing = false;
    try { console.log('[search] buildIndex: end'); } catch { }
    // If dialog is open, refresh to remove the indexing banner or show fresh content
    if (this._container) this._updateResults();
  }

  _computeGroupSignature() {
    try {
      const groups = this.formGenerator?.groupElements;
      if (!groups || groups.size === 0) return '';
      const list = [];
      groups.forEach((info, groupId) => {
        if (typeof groupId !== 'string') return;
        if (!(groupId.startsWith('form-group-') || groupId.startsWith('form-array-item-'))) return;
        // Derive schemaPath similarly to _buildIndex fallback
        let schemaPath = info?.schemaPath || info?.element?.dataset?.schemaPath || '';
        if (!schemaPath) {
          const mItem = groupId.match(/^form-array-item-(.+)-(\d+)$/);
          if (mItem) {
            const hyph = mItem[1];
            const idx = Number(mItem[2]);
            if (!Number.isNaN(idx)) {
              const dot = String(hyph).replace(/-/g, '.');
              schemaPath = `${dot}[${idx}]`;
            }
          } else {
            const mGroup = groupId.match(/^form-group-(.+)$/);
            if (mGroup) {
              const hyph = mGroup[1];
              schemaPath = String(hyph).replace(/-/g, '.');
            }
          }
        }
        list.push({ id: groupId, path: schemaPath });
      });
      // Also include model-derived array items for any array parent present (and not in groupElements)
      const out = [...list];
      for (const entry of list) {
        const ptr = inputNameToPointer(entry.path || '');
        const node = ptr ? findModelNodeByPointer(this.formGenerator.formUiModel, ptr) : null;
        if (!node || node.type !== 'array' || !Array.isArray(node.items)) continue;
        for (let i = 0; i < node.items.length; i += 1) {
          const childPath = `${entry.path}[${i}]`;
          const childId = arrayItemId(entry.path, i);
          // Add only if not already captured
          if (!out.some((e) => e.id === childId)) {
            out.push({ id: childId, path: childPath });
          }
        }
      }
      // Deterministic signature in current nav/render order
      return JSON.stringify(out);
    } catch { return ''; }
  }

  _refreshStatuses() {
    try {
      if (!Array.isArray(this._index) || this._index.length === 0) return;
      try { console.log('[search] refreshStatuses: updating', this._index.length, 'items'); } catch { }
      this._index = this._index.map((entry) => {
        const ptr = inputNameToPointer(entry.schemaPath || '');
        const node = ptr ? findModelNodeByPointer(this.formGenerator.formUiModel, ptr) : null;
        return {
          ...entry,
          isActive: !!(node && node.isActive),
          activatable: !!(node && node.activatable),
        };
      });
    } catch { /* noop */ }
  }

  _buildBreadcrumbLabels(schemaPath) {
    const schemaSvc = this.formGenerator?.services?.schema;
    const rootTitle = (schemaSvc && schemaSvc.getTitleAtPointer(this.formGenerator.schema, '#', ''))
      || this.formGenerator.schema?.title || 'Form';
    if (!schemaPath) return [rootTitle];
    const tokens = String(schemaPath).split('.').filter((t) => t && t !== 'root');
    let curSchema = this.formGenerator.schema;
    const labels = [rootTitle];
    tokens.forEach((tok) => {
      const m = tok.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = m ? m[1] : tok;
      const idx = m && m[2] ? Number(m[2]) : null;
      const norm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(curSchema) || curSchema || {});
      const propSchema = norm?.properties?.[key];
      const eff = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(propSchema) || propSchema || {});
      let title = this.formGenerator.getSchemaTitle(eff || {}, key);
      if (eff?.type === 'array' && idx != null) {
        const itemSchema = this.formGenerator.derefNode(eff.items) || eff.items || {};
        const itemTitle = this.formGenerator.getSchemaTitle(itemSchema || {}, key) || title || 'Item';
        title = `${itemTitle} #${idx + 1}`;
        curSchema = itemSchema;
      } else {
        curSchema = eff;
      }
      if (title) labels.push(title);
    });
    return labels.length ? labels : ['Form'];
  }

  _compareSchemaPath(aPath, bPath) {
    // Normalize undefined/null to empty string
    const a = String(aPath || '');
    const b = String(bPath || '');
    if (a === b) return 0;
    // Parent before children
    const aIsParentOfB = a !== '' && (b.startsWith(a + '.') || b.startsWith(a + '['));
    const bIsParentOfA = b !== '' && (a.startsWith(b + '.') || a.startsWith(b + '['));
    if (a === '') return -1; // root first
    if (b === '') return 1;
    if (aIsParentOfB) return -1;
    if (bIsParentOfA) return 1;

    const toTokens = (p) => p.split('.').map((tok) => {
      const m = tok.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      return { key: (m ? m[1] : tok) || '', idx: m && m[2] ? Number(m[2]) : null };
    });
    const ta = toTokens(a);
    const tb = toTokens(b);
    const len = Math.max(ta.length, tb.length);
    for (let i = 0; i < len; i += 1) {
      const xa = ta[i];
      const xb = tb[i];
      if (!xa) return -1;
      if (!xb) return 1;
      if (xa.key !== xb.key) return xa.key.localeCompare(xb.key);
      if (xa.idx != null || xb.idx != null) {
        const ai = xa.idx != null ? xa.idx : -1;
        const bi = xb.idx != null ? xb.idx : -1;
        if (ai !== bi) return ai - bi;
      }
    }
    return 0;
  }

  // Advanced query parsing and matching
  _parseQuery(input) {
    const raw = String(input || '').trim();
    if (!raw) return { clauses: [], hasOr: false };
    const parts = raw.split(/\s+or\s+/i); // split on OR
    const clauses = parts.map((cl) => String(cl).trim())
      .filter((cl) => cl.length > 0)
      .map((cl) => cl.split(/\s+/).map((t) => t.toLowerCase()).filter(Boolean));
    return { clauses, hasOr: parts.length > 1 };
  }

  _matchesItem(item, parsed) {
    const { clauses, hasOr } = parsed || {};
    if (!clauses || clauses.length === 0) return true;
    const hay = `${item.titleLc} ${item.joinedCrumbsLc}`;
    const clauseMatches = (tokens) => tokens.every((t) => hay.includes(t));
    if (hasOr) return clauses.some((tokens) => clauseMatches(tokens));
    // Single clause (implicit AND across all keywords)
    return clauseMatches(clauses[0] || []);
  }

  _togglePin(e, groupId) {
    e.preventDefault();
    e.stopPropagation();
    if (this._pinned.has(groupId)) this._pinned.delete(groupId); else this._pinned.add(groupId);
    this._savePinned();
    // Re-render current list to reflect star state
    this._updateResults();
  }

  _getPinnedResults() {
    if (!this._index || this._index.length === 0 || this._pinned.size === 0) return [];
    const set = this._pinned;
    const orderMap = this._orderByGroupId || new Map();
    return this._index.filter((e) => set.has(e.groupId))
      .sort((a, b) => {
        const oa = orderMap.has(a.groupId) ? orderMap.get(a.groupId) : Number.MAX_SAFE_INTEGER;
        const ob = orderMap.has(b.groupId) ? orderMap.get(b.groupId) : Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        return this._compareSchemaPath(a.schemaPath, b.schemaPath);
      });
  }

  _loadPinned() {
    try {
      const raw = localStorage.getItem('form-search-pins') || '[]';
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) this._pinned = new Set(arr);
    } catch { this._pinned = new Set(); }
  }

  _savePinned() {
    try { localStorage.setItem('form-search-pins', JSON.stringify(Array.from(this._pinned))); } catch { }
  }
}


