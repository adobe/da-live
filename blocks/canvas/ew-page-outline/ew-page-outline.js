import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { treeFocusIn, treeKeydown } from '../utils/tree-nav.js';
import { parseSections } from '../editor-utils/editor-utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { canvasBus } from '../utils/canvas-bus.js';
import {
  deleteBlock,
  deleteContentItem,
  deleteSection,
  insertBlockAtSectionStart,
  insertSectionAfter,
  moveBlock,
  moveBlockToContentItem,
  moveBlockToSection,
  moveContentItem,
  moveSection,
  setSectionName,
  MAX_SECTION_NAME,
} from '../editor-utils/blocks.js';
import { fetchExtensions } from '../ew-panel-extensions/helpers.js';

const DELETE_ICON_SRC = '/img/icons/s2-icon-delete-20-n.svg';
const DRAG_ICON_SRC = '/img/icons/s2-icon-draghandle-20-n.svg';
const MORE_ICON_SRC = '/img/icons/s2-icon-more-20-n.svg';
const FOCUS_TARGETS = '.section-menu-trigger, [role="treeitem"]';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
await import(`${getNx()}/blocks/shared/menu/menu.js`);

const [formStyle, buttonsStyle, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const OUTLINE_TYPES = {
  SECTION: 'section',
  BLOCK: 'block',
  CONTENT: 'content',
};

const DROP_POSITIONS = {
  BEFORE: 'before',
  AFTER: 'after',
};

function contentChildEqual(child, other) {
  return child.proseIndex === other.proseIndex && child.innerText === other.innerText
    && child.kind === other.kind && child.level === other.level && child.ordered === other.ordered;
}

function contentChildLabel(child) {
  switch (child.kind) {
    case 'heading': return `Heading ${child.level}`;
    case 'list': return child.ordered ? 'Numbered list' : 'Bullet list';
    case 'image': return 'Image';
    case 'code': return 'Code block';
    case 'quote': return 'Blockquote';
    default: return 'Paragraph';
  }
}

function itemsEqual(item, other) {
  if (!other || item.type !== other.type) return false;
  if (item.type === 'block') return item.blockIndex === other.blockIndex && item.name === other.name;
  if (item.proseIndex !== other.proseIndex || item.innerText !== other.innerText) return false;
  const children = item.children ?? [];
  const otherChildren = other.children ?? [];
  return children.length === otherChildren.length
    && children.every((child, i) => contentChildEqual(child, otherChildren[i]));
}

function sectionsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((sec, i) => {
    const other = b[i];
    return sec.sectionIndex === other.sectionIndex
      && sec.name === other.name
      && sec.items.length === other.items.length
      && sec.items.every((item, j) => itemsEqual(item, other.items[j]));
  });
}

class EwPageOutline extends LitElement {
  static properties = {
    _sections: { state: true },
    _selectedBlockIndex: { state: true },
    _selectedProseIndex: { state: true },
    _hashState: { state: true },
    _hasBlockLibrary: { state: true },
    _expandedContent: { state: true },
    _pendingDelete: { state: true },
    _editingSection: { state: true },
    _draftName: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyle, style, buttonsStyle];
    this._expandedContent = new Set();
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
    this._unsubscribeHtml = canvasBus.editorHtmlState.subscribe((aemHtml) => {
      if (aemHtml.trim()) {
        const next = parseSections(aemHtml);
        if (this._editingSection != null && next.length !== this._sections?.length) {
          this._cancelRename();
        }
        if (!sectionsEqual(next, this._sections)) {
          this._sections = next;
          // A structural edit is the only time proseIndex-keyed expansion state can go
          // stale (positions shift), so this is the one point where it's safe to drop —
          // selection changes never do (see _expandRunForProse).
          this._expandedContent = new Set();
        }
      } else {
        this._resetDocumentState();
      }
      if (this._pendingFocus?.awaitingReparse) {
        this._pendingFocus.awaitingReparse = false;
        this.requestUpdate();
      }
    });
    this._unsubscribeSelect = canvasBus.editorSelectState
      .subscribe(({ blockIndex, proseIndex, source }) => {
        if (source === 'outline') return;
        this._selectedBlockIndex = blockIndex;
        this._selectedProseIndex = proseIndex;
        if (proseIndex != null) this._expandRunForProse(proseIndex);
      });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this._unsubscribeHtml?.();
    this._unsubscribeSelect?.();
  }

  // Checked when a change is applied, not only when it starts: the document can
  // switch while a drag, delete dialog, rename or block library is open.
  get _writableView() {
    const { view } = getExtensionsBridge();
    return view?.editable ? view : null;
  }

  get _canWrite() {
    return !!this._writableView;
  }

  get _selectedPath() {
    const { org, site, path } = this._hashState ?? {};
    return org && site && path ? `${org}/${site}/${path}` : '';
  }

  willUpdate() {
    const sp = this._selectedPath;
    if (this._prevSelectedPath !== undefined && sp !== this._prevSelectedPath) {
      this._resetDocumentState();
    }
    this._prevSelectedPath = sp;

    const { org, site } = this._hashState ?? {};
    const orgSiteKey = org && site ? `${org}/${site}` : '';
    if (orgSiteKey !== this._prevOrgSiteKey) {
      this._prevOrgSiteKey = orgSiteKey;
      this._hasBlockLibrary = false;
      if (orgSiteKey) this._checkBlockLibrary(org, site);
    }
  }

  _resetDocumentState() {
    this._sections = undefined;
    this._selectedBlockIndex = undefined;
    this._selectedProseIndex = undefined;
    this._cancelRename();
    this._pendingDelete = null;
    this._pendingFocus = null;
    this._clearDragState();
  }

  async _checkBlockLibrary(org, site) {
    const extensions = await fetchExtensions(org, site);
    if (org !== this._hashState?.org || site !== this._hashState?.site) return;
    this._hasBlockLibrary = !!extensions?.find((ext) => ext.name === 'blocks');
  }

  updated() {
    this._focusRenameInput();
    this._resolvePendingFocus();
  }

  _focusRenameInput() {
    if (this._editingSection == null || this._focusedSection === this._editingSection) {
      this._focusedSection = this._editingSection;
      return;
    }
    this._focusedSection = this._editingSection;
    const input = this.shadowRoot.querySelector('.section-name-input');
    input?.focus();
    input?.select();
  }

  _resolvePendingFocus() {
    if (!this._pendingFocus || this._pendingFocus.awaitingReparse) return;
    const { target } = this._pendingFocus;
    this._pendingFocus = null;
    target()?.focus();
  }

  _queueFocus(target, { awaitingReparse = false } = {}) {
    this._pendingFocus = { target, awaitingReparse };
    if (!awaitingReparse) this.requestUpdate();
  }

  _runWithFocus(view, target, action) {
    const before = view.state.doc;
    this._queueFocus(target, { awaitingReparse: true });
    action();
    if (view.state.doc === before) this._pendingFocus = null;
  }

  _menuTrigger(sectionIndex) {
    return this.shadowRoot.querySelector(`.section-menu-trigger[data-section-index="${sectionIndex}"]`);
  }

  _focusTargets() {
    return [...this.shadowRoot.querySelectorAll(FOCUS_TARGETS)];
  }

  _focusTargetAt(index) {
    const targets = this._focusTargets();
    return targets[index] ?? targets[targets.length - 1];
  }

  _select(blockIndex) {
    this._selectedBlockIndex = blockIndex;
    this._selectedProseIndex = undefined;
    canvasBus.editorSelectState.emit({ blockIndex, source: 'outline' });
  }

  _selectProse(proseIndex, kind) {
    this._selectedProseIndex = proseIndex;
    this._selectedBlockIndex = undefined;
    this._expandRunForProse(proseIndex);
    canvasBus.editorProseSelectState.emit({ proseIndex, kind });
  }

  _toggleContentGroup(key) {
    const next = new Set(this._expandedContent);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._expandedContent = next;
  }

  // Selection never collapses anything — it only ensures the run holding the new
  // selection is visible, adding it alongside whatever's already expanded. Expansion is
  // only ever cleared wholesale on a reparse (see the canvasBus.editorHtmlState subscription).
  _expandRunForProse(proseIndex) {
    const runKey = this._findRunKeyForProseIndex(proseIndex);
    if (runKey == null) return;
    this._expandedContent = new Set(this._expandedContent).add(runKey);
  }

  _findRunKeyForProseIndex(proseIndex) {
    const sections = this._sections ?? [];
    for (const [secIdx, sec] of sections.entries()) {
      for (const [itemIdx, item] of sec.items.entries()) {
        if (item.type === 'content') {
          const hasChild = item.children.some((child) => child.proseIndex === proseIndex);
          if (hasChild) return item.proseIndex;

          // A node invisible in the outline (e.g. a fresh empty paragraph from pressing
          // Enter) still belongs to this run if its position falls between the run's own
          // start and whatever comes next — the next item in this section, the next
          // section's first item, or unbounded if this is the very last item overall.
          const nextItem = sec.items[itemIdx + 1] ?? sections[secIdx + 1]?.items[0];
          const upperBound = nextItem ? nextItem.proseIndex : Infinity;
          if (proseIndex >= item.proseIndex && proseIndex < upperBound) return item.proseIndex;
        }
      }
    }
    return undefined;
  }

  _clearDropIndicator() {
    this.shadowRoot.querySelector('[data-drop-position]')?.removeAttribute('data-drop-position');
  }

  _setDropIndicator(el, data, indicatorPosition = data.dropPosition) {
    this._clearDropIndicator();
    el.dataset.dropPosition = indicatorPosition;
    this._dropTarget = data;
  }

  _clearDragState() {
    this._clearDropIndicator();
    this._dragSourceEl?.classList.remove('dragging');
    this._dragSourceEl = null;
    this._dragging = null;
    this._dropTarget = null;
  }

  _onDragStart(e, type, index) {
    // Selected text still drags when the item is not draggable.
    if (!this._canWrite) {
      e.preventDefault();
      return;
    }
    this._dragging = { type, index };
    const el = type === OUTLINE_TYPES.SECTION ? e.currentTarget.parentElement : e.currentTarget;
    el.classList.add('dragging');
    this._dragSourceEl = el;
    e.dataTransfer.effectAllowed = 'move';
  }

  _onSectionDragOver(e, sec) {
    const type = this._dragging?.type;
    const rect = e.currentTarget.getBoundingClientRect();
    const dropPosition = e.clientY < rect.top + rect.height / 2
      ? DROP_POSITIONS.BEFORE : DROP_POSITIONS.AFTER;

    if (type === OUTLINE_TYPES.SECTION) {
      if (this._dragging.index === sec.sectionIndex) return;
      e.preventDefault();

      const el = dropPosition === DROP_POSITIONS.BEFORE
        ? e.currentTarget.querySelector('[data-section-header]')
        : e.currentTarget;

      this._setDropIndicator(el, { sectionIndex: sec.sectionIndex, dropPosition });
    } else if (type === OUTLINE_TYPES.CONTENT) {
      // Bubbles here from anywhere unclaimed in the section; only the header is before/after-aware.
      e.preventDefault();
      const headerEl = e.currentTarget.querySelector('[data-section-header]');
      const onHeader = headerEl?.contains(e.target);
      const contentDropPosition = onHeader ? dropPosition : DROP_POSITIONS.AFTER;
      this._setDropIndicator(
        headerEl,
        { sectionIndex: sec.sectionIndex, dropPosition: contentDropPosition },
      );
    } else {
      if (sec.blocks.some((b) => b.blockIndex === this._dragging?.index)) return;
      if (sec.blocks.length) {
        const { blockIndex } = sec.blocks[sec.blocks.length - 1];
        e.preventDefault();

        const lastBlockEl = this.shadowRoot.querySelector(`[data-block-index="${blockIndex}"]`);
        if (!lastBlockEl) return;
        this._setDropIndicator(lastBlockEl, { blockIndex, dropPosition: DROP_POSITIONS.AFTER });
        return;
      }

      // No blocks to anchor on — fall back to the section boundary itself.
      e.preventDefault();
      const headerEl = e.currentTarget.querySelector('[data-section-header]');
      this._setDropIndicator(
        headerEl,
        { sectionIndex: sec.sectionIndex, dropPosition: DROP_POSITIONS.AFTER },
      );
    }
  }

  _onBlockDragOver(e, blockIndex) {
    const type = this._dragging?.type;
    if (![OUTLINE_TYPES.BLOCK, OUTLINE_TYPES.CONTENT].includes(type)) return;
    if (type === OUTLINE_TYPES.BLOCK && this._dragging.index === blockIndex) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const dropPosition = e.clientY < rect.top + rect.height / 2
      ? DROP_POSITIONS.BEFORE : DROP_POSITIONS.AFTER;
    this._setDropIndicator(e.currentTarget, { blockIndex, dropPosition });
  }

  _onContentDragOver(e, child) {
    const type = this._dragging?.type;
    if (![OUTLINE_TYPES.CONTENT, OUTLINE_TYPES.BLOCK].includes(type)) return;
    const isSameChild = type === OUTLINE_TYPES.CONTENT
      && this._dragging.index.proseIndex === child.proseIndex;
    if (isSameChild) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const dropPosition = e.clientY < rect.top + rect.height / 2
      ? DROP_POSITIONS.BEFORE : DROP_POSITIONS.AFTER;
    this._setDropIndicator(e.currentTarget, { contentChild: child, dropPosition });
  }

  _onContentGroupDragOver(e, item) {
    if (![OUTLINE_TYPES.CONTENT, OUTLINE_TYPES.BLOCK].includes(this._dragging?.type)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const dropPosition = e.clientY < rect.top + rect.height / 2
      ? DROP_POSITIONS.BEFORE : DROP_POSITIONS.AFTER;
    if (this._expandedContent?.has(item.proseIndex)) {
      this._setDropIndicator(
        e.currentTarget,
        { contentChild: item.children[0], dropPosition: DROP_POSITIONS.BEFORE },
        dropPosition,
      );
      return;
    }
    const targetChild = dropPosition === DROP_POSITIONS.BEFORE
      ? item.children[0]
      : item.children[item.children.length - 1];
    this._setDropIndicator(e.currentTarget, { contentChild: targetChild, dropPosition });
  }

  _onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { _dragging, _dropTarget } = this;
    this._clearDragState();
    const view = this._writableView;
    if (!_dropTarget || !_dragging || !view) return;

    if (_dragging.type === OUTLINE_TYPES.CONTENT) {
      let target;
      if (_dropTarget.contentChild) target = { type: 'content', child: _dropTarget.contentChild };
      else if (_dropTarget.blockIndex != null) target = { type: 'block', blockIndex: _dropTarget.blockIndex };
      else if (_dropTarget.sectionIndex != null) target = { type: 'section', sectionIndex: _dropTarget.sectionIndex };
      else return;
      moveContentItem(view, _dragging.index, target, _dropTarget.dropPosition);
    } else if (_dragging.type === OUTLINE_TYPES.BLOCK && _dropTarget.contentChild) {
      const { contentChild, dropPosition } = _dropTarget;
      moveBlockToContentItem(view, _dragging.index, contentChild, dropPosition);
    } else if (_dragging.type === OUTLINE_TYPES.BLOCK && _dropTarget.sectionIndex != null) {
      moveBlockToSection(view, _dragging.index, _dropTarget.sectionIndex, _dropTarget.dropPosition);
    } else if (_dropTarget.blockIndex != null) {
      if (_dragging.type !== OUTLINE_TYPES.BLOCK) return;
      moveBlock(view, _dragging.index, _dropTarget.blockIndex, _dropTarget.dropPosition);
    } else if (_dropTarget.sectionIndex != null) {
      if (_dragging.type !== OUTLINE_TYPES.SECTION) return;
      moveSection(view, _dragging.index, _dropTarget.sectionIndex, _dropTarget.dropPosition);
    }
  };

  _onDragEnd = () => {
    this._clearDragState();
  };

  _onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      this._clearDropIndicator();
      this._dropTarget = null;
    }
  };

  _onTreeFocusIn = (e) => {
    treeFocusIn(e, this.shadowRoot);
  };

  _onTreeKeydown = (e) => {
    const item = this.shadowRoot.activeElement;
    if (item?.matches('.content-item[aria-expanded]')) {
      const expanded = item.getAttribute('aria-expanded') === 'true';
      if ((e.key === 'ArrowRight' && !expanded) || (e.key === 'ArrowLeft' && expanded)) {
        e.preventDefault();
        item.click();
        return;
      }
    }
    treeKeydown(e, this.shadowRoot);
  };

  _startRename(sec) {
    this._editingSection = sec.sectionIndex;
    this._draftName = sec.name ?? '';
  }

  _cancelRename() {
    this._editingSection = undefined;
    this._draftName = '';
  }

  _commitRename(sectionIndex) {
    if (this._editingSection !== sectionIndex) return;
    const next = this._draftName.trim();
    const current = this._sections?.[sectionIndex]?.name ?? '';
    this._cancelRename();
    if (next === current) return;
    const view = this._writableView;
    if (view) setSectionName(view, sectionIndex, next);
  }

  _onRenameKeydown(e, sectionIndex) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      this._commitRename(sectionIndex);
      this._queueFocus(() => this._menuTrigger(sectionIndex));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._cancelRename();
      this._queueFocus(() => this._menuTrigger(sectionIndex));
    }
  }

  _loadBlockLibraryModal() {
    return import('../ew-block-library-modal/ew-block-library-modal.js');
  }

  async _openAddBlockModal(sectionIndex) {
    const view = this._writableView;
    if (!view) return;
    const { openBlockLibraryModal } = await this._loadBlockLibraryModal();
    const insertedBlock = () => {
      const first = this._sections?.[sectionIndex]?.items[0];
      if (first?.type !== OUTLINE_TYPES.BLOCK) return null;
      return this.shadowRoot.querySelector(`[data-block-index="${first.blockIndex}"]`);
    };
    const onInsert = (dom) => {
      if (this._writableView !== view) return;
      this._runWithFocus(
        view,
        insertedBlock,
        () => insertBlockAtSectionStart(view, dom, sectionIndex),
      );
    };
    openBlockLibraryModal({ onInsert });
  }

  _addSectionAfter(sectionIndex) {
    const view = this._writableView;
    if (!view) return;
    const nextIndex = sectionIndex + 1;
    this._runWithFocus(
      view,
      () => this._menuTrigger(nextIndex),
      () => insertSectionAfter(view, sectionIndex),
    );
  }

  _onMenuClose(e) {
    const menu = e.currentTarget;
    if (!menu.shadowRoot?.activeElement) return;
    menu.querySelector('[slot="trigger"]')?.focus();
  }

  _onSectionMenuSelect(e, sec) {
    const trigger = e.currentTarget.querySelector('[slot="trigger"]');
    const { sectionIndex } = sec;
    switch (e.detail.id) {
      case 'rename': this._startRename(sec); break;
      case 'add-block': this._openAddBlockModal(sectionIndex); break;
      case 'add-section-after': this._addSectionAfter(sectionIndex); break;
      case 'delete': this._requestDelete(OUTLINE_TYPES.SECTION, sectionIndex, trigger, trigger); break;
      default: break;
    }
  }

  // Array position (not proseIndex) of the run holding this child, so a delete can find
  // it again afterward without comparing positions across the edit (see _onDelete).
  _findRunLocation(proseIndex) {
    for (const [sectionIndex, sec] of (this._sections ?? []).entries()) {
      const itemIndex = sec.items.findIndex(
        (item) => item.type === 'content'
          && item.children.some((child) => child.proseIndex === proseIndex),
      );
      if (itemIndex !== -1) return { sectionIndex, itemIndex };
    }
    return undefined;
  }

  // Block items only carry their blockIndex at the drag/select call sites, so a delete
  // confirmation needs to look the rest of the block up by that index (see _deleteInfo).
  _findBlockItem(blockIndex) {
    for (const sec of this._sections ?? []) {
      const item = sec.items.find((i) => i.type === 'block' && i.blockIndex === blockIndex);
      if (item) return item;
    }
    return undefined;
  }

  // Single source of truth for delete-confirmation copy, so type + index is all a call
  // site needs — the button label and the dialog text stay in sync automatically.
  _deleteInfo(type, index) {
    if (type === OUTLINE_TYPES.SECTION) {
      return {
        title: 'Delete section',
        noun: `section ${index + 1}`,
        message: html`Are you sure you want to delete <strong>Section ${index + 1}</strong>?`,
      };
    }
    if (type === OUTLINE_TYPES.CONTENT) {
      const label = contentChildLabel(index);
      const kind = label.toLowerCase();
      const noun = index.snippet ? `${kind} (${index.snippet})` : kind;
      const message = index.snippet
        ? html`Are you sure you want to delete the <strong>${kind}</strong>: "${index.snippet}"?`
        : html`Are you sure you want to delete the <strong>${kind}</strong>?`;
      // Level only matters in the body copy — the title reads oddly duplicating
      // it (e.g. "Delete Heading 2" vs. the "heading 2" already in the sentence).
      const title = index.kind === 'heading' ? 'Delete Heading' : `Delete ${label}`;
      return { title, noun, message };
    }
    const item = this._findBlockItem(index);
    const label = item ? `${item.name}${item.variant ? ` (${item.variant})` : ''}` : 'block';
    return {
      title: 'Delete block',
      noun: `${label} block`,
      message: html`Are you sure you want to delete the <strong>${label}</strong> block?`,
    };
  }

  _onDelete(e, type, index) {
    e.stopPropagation();
    e.preventDefault();
    const opener = e.currentTarget;
    this._requestDelete(type, index, opener, opener.closest('[role="treeitem"]'));
  }

  _requestDelete(type, index, opener, row) {
    this._pendingDelete = { type, index, opener, row };
  }

  _cancelDelete() {
    if (!this._pendingDelete) return;
    const { opener } = this._pendingDelete;
    this._pendingDelete = null;
    if (opener) this._queueFocus(() => (opener.isConnected ? opener : null));
  }

  _confirmDelete() {
    const { type, index, row } = this._pendingDelete;
    this._pendingDelete = null;
    const view = this._writableView;
    if (!view) return;
    const rowIndex = this._focusTargets().indexOf(row);
    const target = () => (rowIndex === -1 ? null : this._focusTargetAt(rowIndex));
    this._runWithFocus(view, target, () => this._applyDelete(view, type, index));
  }

  _applyDelete(view, type, index) {
    if (type === OUTLINE_TYPES.BLOCK) {
      deleteBlock(view, index);
    } else if (type === OUTLINE_TYPES.CONTENT) {
      const location = this._findRunLocation(index.proseIndex);
      deleteContentItem(view, index);
      // A content-child delete never reorders/merges runs, only shrinks or removes the
      // deleted-from one — so the same array position still identifies it, if it survived.
      const survivingRun = location
        && this._sections?.[location.sectionIndex]?.items[location.itemIndex];
      if (survivingRun?.type === 'content') this._expandRunForProse(survivingRun.proseIndex);
    } else {
      deleteSection(view, index);
    }
  }

  _renderDeleteDialog() {
    const { type, index } = this._pendingDelete;
    const { title, message } = this._deleteInfo(type, index);
    return html`
      <nx-dialog class="ew-po-delete" title="${title}" @close=${() => this._cancelDelete()}>
        <span>${message}</span>
        <button slot="actions" class="nx-form-btn-secondary"
          @click=${() => this._cancelDelete()}>Cancel</button>
        <button slot="actions" class="nx-form-btn-primary"
          @click=${() => this._confirmDelete()}>Delete</button>
      </nx-dialog>`;
  }

  _renderDeleteButton(type, index) {
    if (!this._canWrite) return nothing;
    const { noun } = this._deleteInfo(type, index);
    const label = `Delete ${noun}`;
    return html`
      <button type="button" class="nx-action-btn-icon nx-btn-sm action-btn delete-btn" draggable="false"
              aria-label="${label}"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => this._onDelete(e, type, index)}>
        <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
          <use href="${DELETE_ICON_SRC}#icon"></use>
        </svg>
      </button>`;
  }

  _renderDragHandle() {
    return html`<span class="drag-handle" aria-hidden="true">
      ${this._canWrite ? html`<svg class="icon" viewBox="0 0 20 20">
        <use href="${DRAG_ICON_SRC}#icon"></use>
      </svg>` : nothing}
    </span>`;
  }

  _renderSectionMenu(sec) {
    if (!this._canWrite || this._editingSection === sec.sectionIndex) return nothing;
    const label = sec.name || `Section ${sec.sectionIndex + 1}`;
    const items = [
      { id: 'rename', label: 'Rename', icon: 'edit' },
      ...(this._hasBlockLibrary ? [{ id: 'add-block', label: 'Add block', icon: 'tableadd' }] : []),
      { id: 'add-section-after', label: 'Add section after', icon: 'addcircle' },
      { divider: true },
      { id: 'delete', label: 'Delete', icon: 'delete' },
    ];
    return html`
      <nx-menu class="section-menu" placement="auto" .items=${items}
               @close=${this._onMenuClose}
               @select=${(e) => this._onSectionMenuSelect(e, sec)}>
        <button type="button" slot="trigger"
                class="nx-action-btn-icon nx-btn-sm section-menu-trigger"
                data-section-index="${sec.sectionIndex}"
                aria-label="More actions for ${label}"
                draggable="false"
                @pointerdown=${(e) => e.stopPropagation()}>
          <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
            <use href="${MORE_ICON_SRC}#icon"></use>
          </svg>
        </button>
      </nx-menu>`;
  }

  _renderContentGroup(item, isFirst) {
    const key = item.proseIndex;
    const expanded = this._expandedContent?.has(key);
    const canWrite = this._canWrite;
    return html`
      <li class="content-group" role="none">
        <div class="block-item content-item" role="treeitem"
             tabindex="${isFirst ? '0' : '-1'}"
             aria-expanded="${expanded}"
             @click=${() => this._toggleContentGroup(key)}
             @dragover=${(e) => this._onContentGroupDragOver(e, item)}
             @drop=${this._onDrop}>
          <span class="block-name content-label">Default content</span>
        </div>
        ${expanded ? html`
          <ul class="content-children" role="group">
            ${item.children.map((child) => {
      const label = contentChildLabel(child);
      return html`
              <li class="block-item content-item content-child ${this._selectedProseIndex === child.proseIndex ? 'selected' : ''}"
                  role="treeitem" tabindex="-1"
                  aria-selected="${this._selectedProseIndex === child.proseIndex}"
                  draggable="${canWrite}"
                  @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.CONTENT, child)}
                  @dragover=${(e) => this._onContentDragOver(e, child)}
                  @drop=${this._onDrop}
                  @dragend=${this._onDragEnd}
                  @click=${(e) => { e.stopPropagation(); this._selectProse(child.proseIndex, child.kind); }}>
                ${this._renderDragHandle()}
                <span class="content-label-stack">
                  <span class="block-name content-label">${label}</span>
                  ${child.snippet ? html`<span class="content-snippet">${child.snippet}</span>` : nothing}
                </span>
                ${this._renderDeleteButton(OUTLINE_TYPES.CONTENT, child)}
              </li>`;
    })}
          </ul>` : nothing}
      </li>`;
  }

  _renderSectionLabel(sec) {
    const fallback = `Section ${sec.sectionIndex + 1}`;
    if (this._editingSection === sec.sectionIndex) {
      return html`
        <input class="nx-input section-name-input" type="text"
               .value=${this._draftName}
               maxlength="${MAX_SECTION_NAME}"
               placeholder="${fallback}"
               aria-label="Section name"
               @pointerdown=${(e) => e.stopPropagation()}
               @input=${(e) => { this._draftName = e.target.value; }}
               @keydown=${(e) => this._onRenameKeydown(e, sec.sectionIndex)}
               @blur=${() => this._commitRename(sec.sectionIndex)}>`;
    }
    const label = sec.name || fallback;
    return html`<span class="section-label" title="${label}">${label}</span>`;
  }

  _renderSection(sec, isFirstSection) {
    const editing = this._editingSection === sec.sectionIndex;
    const canWrite = this._canWrite;
    return html`
      <li class="outline-section" role="none"
          @dragover=${(e) => this._onSectionDragOver(e, sec)}
          @dragleave=${this._onDragLeave}
          @drop=${this._onDrop}>
        <div class="section-header" data-section-header
             draggable="${canWrite && !editing}"
             @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.SECTION, sec.sectionIndex)}
             @dragend=${this._onDragEnd}>
          ${this._renderDragHandle()}
          ${this._renderSectionLabel(sec)}
          ${this._renderSectionMenu(sec)}
        </div>
        <ul class="block-list" role="group"
            aria-label="Blocks in section ${sec.sectionIndex + 1}">
          ${sec.items.length === 0
        ? html`<li class="block-item block-empty"
                    role="treeitem" tabindex="-1">
                <span class="empty-label">Empty section</span>
              </li>`
        : sec.items.map((item, itemIdx) => (item.type === 'block'
          ? html`
            <li class="block-item ${this._selectedBlockIndex === item.blockIndex ? 'selected' : ''}" role="treeitem"
                data-block-index="${item.blockIndex}"
                tabindex="${isFirstSection && itemIdx === 0 ? '0' : '-1'}"
                aria-selected="${this._selectedBlockIndex === item.blockIndex}"
                draggable="${canWrite}"
                @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.BLOCK, item.blockIndex)}
                @dragover=${(e) => this._onBlockDragOver(e, item.blockIndex)}
                @drop=${this._onDrop}
                @dragend=${this._onDragEnd}
                @click=${() => this._select(item.blockIndex)}>
              ${this._renderDragHandle()}
              <span class="block-name">${item.name}${item.variant ? ` (${item.variant})` : ''}</span>
              ${this._renderDeleteButton(OUTLINE_TYPES.BLOCK, item.blockIndex)}
            </li>`
          : this._renderContentGroup(item, isFirstSection && itemIdx === 0)))}
        </ul>
      </li>`;
  }

  render() {
    if (!this._selectedPath) {
      return html`<div class="ew-page-outline">
        <p class="placeholder">Select a page to see its outline.</p>
      </div>`;
    }

    return html`
    <section class="ew-page-outline">
      <div class="list-wrap">
        ${!this._sections
        ? html`<p class="placeholder">No blocks found.</p>`
        : html`<ul class="outline-list" role="tree" aria-label="Page outline"
                @keydown=${this._onTreeKeydown}
                @focusin=${this._onTreeFocusIn}>
              ${this._sections.map((sec, i) => this._renderSection(sec, i === 0))}
            </ul>`}
      </div>
      ${this._pendingDelete ? this._renderDeleteDialog() : nothing}
    </section>`;
  }
}

customElements.define('ew-page-outline', EwPageOutline);
