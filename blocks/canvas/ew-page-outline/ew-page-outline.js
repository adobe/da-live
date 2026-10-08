import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { treegridEnsureTabStop, treegridFocusIn, treegridKeydown } from '../utils/treegrid-nav.js';
import { parseSections } from '../editor-utils/editor-utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { canvasBus } from '../utils/canvas-bus.js';
import {
  deleteBlock,
  deleteContentItem,
  deleteSection,
  getActiveBlockIndex,
  getContentItemRange,
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
import {
  blockLabel,
  contentChildLabel,
  getDropTargets,
  sectionLabel,
} from './drop-targets.js';

const DELETE_ICON_SRC = '/img/icons/s2-icon-delete-20-n.svg';
const DRAG_ICON_SRC = '/img/icons/s2-icon-draghandle-20-n.svg';
const MORE_ICON_SRC = '/img/icons/s2-icon-more-20-n.svg';
const FOCUS_TARGETS = '[role="row"]';

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
    _pickup: { state: true },
    _announcement: { state: true },
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
          this._cancelPickup();
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
    document.removeEventListener('pointerdown', this._onPickupOutside, true);
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
    this._endPickup();
  }

  async _checkBlockLibrary(org, site) {
    const extensions = await fetchExtensions(org, site);
    if (org !== this._hashState?.org || site !== this._hashState?.site) return;
    this._hasBlockLibrary = !!extensions?.find((ext) => ext.name === 'blocks');
  }

  updated() {
    treegridEnsureTabStop(this.shadowRoot);
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
          // non-empty section's first item, or unbounded if this is the very last item overall.
          const nextItem = sec.items[itemIdx + 1]
            ?? sections.slice(secIdx + 1).find((next) => next.items.length)?.items[0];
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

  _setDropIndicator(el, data) {
    this._clearDropIndicator();
    el.dataset.dropPosition = data.dropPosition;
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
    this._cancelPickup();
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
    this._performDrop(view, _dragging, _dropTarget);
  };

  _performDrop(view, _dragging, _dropTarget) {
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
  }

  _onDragEnd = () => {
    this._clearDragState();
  };

  _onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      this._clearDropIndicator();
      this._dropTarget = null;
    }
  };

  _onGridFocusIn = (e) => {
    treegridFocusIn(e, this.shadowRoot);
  };

  _onGridKeydown = (e) => {
    if (this._pickup) {
      this._onPickupKeydown(e);
      return;
    }
    treegridKeydown(e, this.shadowRoot);
  };

  _onGridContextMenu = (e) => {
    const row = e.composedPath().find((el) => el.getAttribute?.('role') === 'row');
    const menu = row?.querySelector('nx-menu');
    if (!menu) return;
    e.preventDefault();
    this._cancelPickup();
    if (!menu.open) menu.show({ anchor: menu.querySelector('[slot="trigger"]') });
  };

  _onGridClickCapture = {
    handleEvent: (e) => {
      if (!this._pickup || e.composedPath().includes(this._pickup.handle)) return;
      e.preventDefault();
      e.stopPropagation();
      if (this._dropTarget) this._dropPickup();
      else this._cancelPickup();
    },
    capture: true,
  };

  _onGridPointerLeave = () => {
    if (!this._pickup) return;
    this._clearDropIndicator();
    this._dropTarget = null;
  };

  _onPickupPointer(handler) {
    return (e) => { if (this._pickup) handler(e); };
  }

  _onPickupOutside = (e) => {
    if (!e.composedPath().includes(this)) this._cancelPickup();
  };

  _announce(text) {
    this._announcement = this._announcement === text ? `${text}\u00a0` : text;
  }

  _isPicked(type, index) {
    const dragging = this._pickup?.dragging;
    if (dragging?.type !== type) return false;
    if (type === OUTLINE_TYPES.CONTENT) return dragging.index.proseIndex === index.proseIndex;
    return dragging.index === index;
  }

  _onHandleClick(e, type, index, label) {
    e.stopPropagation();
    const handle = e.currentTarget;
    if (!this._pickup) {
      this._startPickup({ type, index }, handle, label);
      return;
    }
    if (e.detail === 0 && this._dropTarget) this._dropPickup();
    else this._cancelPickup({ focusHandle: true });
  }

  _startPickup(dragging, handle, label) {
    if (!this._canWrite) return;
    const { targets, origin } = getDropTargets(dragging, this._sections, this._expandedContent);
    const source = dragging.type === OUTLINE_TYPES.SECTION
      ? handle.closest('.outline-section')
      : handle.closest('[role="row"]');
    source?.classList.add('dragging');
    this._dragSourceEl = source;
    this._dragging = dragging;
    this._pickup = {
      dragging, handle, label, targets, origin, index: null,
    };
    document.addEventListener('pointerdown', this._onPickupOutside, true);
    this._announce(`Picked up ${label}. Use up and down arrows to choose a position, Enter to drop, Escape to cancel.`);
  }

  _onPickupKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        this._stepPickup(e.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Escape':
        e.preventDefault();
        this._cancelPickup({ focusHandle: true });
        break;
      case 'Tab':
        this._cancelPickup();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
      case 'End':
        e.preventDefault();
        break;
      default: break;
    }
  }

  _stepPickup(delta) {
    const pickup = this._pickup;
    const start = delta > 0 ? pickup.origin : pickup.origin - 1;
    const next = pickup.index == null ? start : pickup.index + delta;
    if (next < 0 || next >= pickup.targets.length) return;
    pickup.index = next;
    const { target, description } = pickup.targets[next];
    const el = this._dropIndicatorEl(pickup.dragging, target);
    if (el) {
      this._setDropIndicator(el, target);
      el.scrollIntoView?.({ block: 'nearest' });
    } else {
      this._dropTarget = target;
    }
    this._announce(description);
  }

  _dropIndicatorEl(dragging, target) {
    const root = this.shadowRoot;
    if (target.blockIndex != null) return root.querySelector(`[data-block-index="${target.blockIndex}"]`);
    if (target.contentChild) {
      const { proseIndex } = target.contentChild;
      return root.querySelector(`[data-child-prose="${proseIndex}"]`)
        ?? root.querySelector(`[data-group-key="${this._findRunKeyForProseIndex(proseIndex)}"]`);
    }
    const section = root.querySelectorAll('.outline-section')[target.sectionIndex];
    if (dragging.type === OUTLINE_TYPES.SECTION && target.dropPosition === DROP_POSITIONS.AFTER) {
      return section;
    }
    return section?.querySelector('[data-section-header]');
  }

  _dropPickup() {
    const { dragging, label } = this._pickup;
    const target = this._dropTarget;
    this._endPickup();
    const view = this._writableView;
    if (!view || !target) return;
    let movedRow = () => null;
    this._runWithFocus(view, () => movedRow(), () => {
      this._performDrop(view, dragging, target);
      movedRow = this._movedRowResolver(view, dragging, target);
    });
    this._announce(`Dropped ${label}.`);
  }

  _cancelPickup({ focusHandle = false } = {}) {
    if (!this._pickup) return;
    const { handle } = this._pickup;
    this._endPickup();
    this._announce('Move cancelled.');
    if (focusHandle && handle.isConnected) handle.focus();
  }

  _endPickup() {
    document.removeEventListener('pointerdown', this._onPickupOutside, true);
    this._pickup = null;
    this._clearDragState();
  }

  _sectionRow(sectionIndex) {
    return this.shadowRoot.querySelectorAll('.outline-section')[sectionIndex]
      ?.querySelector('[data-section-header]');
  }

  _movedRowResolver(view, dragging, target) {
    if (dragging.type === OUTLINE_TYPES.SECTION) {
      let index = target.dropPosition === DROP_POSITIONS.BEFORE
        ? target.sectionIndex : target.sectionIndex + 1;
      if (index > dragging.index) index -= 1;
      return () => this._sectionRow(index);
    }
    if (dragging.type === OUTLINE_TYPES.BLOCK) {
      const blockIndex = getActiveBlockIndex(view);
      return () => this.shadowRoot.querySelector(`[data-block-index="${blockIndex}"]`);
    }
    const pos = view.state.selection.from;
    const find = (retry) => {
      const child = (this._sections ?? [])
        .flatMap((sec) => sec.items.flatMap((item) => item.children ?? []))
        .find((c) => getContentItemRange(view.state.doc, c)?.pos === pos);
      if (!child) return null;
      const row = this.shadowRoot.querySelector(`[data-child-prose="${child.proseIndex}"]`);
      if (row) return row;
      const runKey = this._findRunKeyForProseIndex(child.proseIndex);
      if (!retry) return this.shadowRoot.querySelector(`[data-group-key="${runKey}"]`);
      this._expandRunForProse(child.proseIndex);
      this._queueFocus(() => find(false));
      return null;
    };
    return () => find(true);
  }

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
      case 'delete': {
        const row = trigger.closest('[role="row"]');
        this._requestDelete(OUTLINE_TYPES.SECTION, sectionIndex, trigger, row);
        break;
      }
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
    this._requestDelete(type, index, opener, opener.closest('[role="row"]'));
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
              aria-label="${label}" tabindex="-1"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => this._onDelete(e, type, index)}>
        <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
          <use href="${DELETE_ICON_SRC}#icon"></use>
        </svg>
      </button>`;
  }

  _renderDragHandle(type, index, label) {
    if (!this._canWrite) return html`<span class="drag-handle" aria-hidden="true"></span>`;
    return html`
      <button type="button" class="nx-action-btn-icon nx-btn-sm drag-handle"
              aria-label="Move ${label}" aria-pressed="${this._isPicked(type, index)}"
              tabindex="-1"
              @click=${(e) => this._onHandleClick(e, type, index, label)}>
        <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
          <use href="${DRAG_ICON_SRC}#icon"></use>
        </svg>
      </button>`;
  }

  _renderSectionMenu(sec) {
    if (!this._canWrite || this._editingSection === sec.sectionIndex) return nothing;
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
                aria-label="More actions for ${sectionLabel(sec)}"
                tabindex="-1" draggable="false"
                @pointerdown=${(e) => e.stopPropagation()}>
          <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
            <use href="${MORE_ICON_SRC}#icon"></use>
          </svg>
        </button>
      </nx-menu>`;
  }

  _renderContentChild(child, i, siblings) {
    const label = contentChildLabel(child);
    const selected = this._selectedProseIndex === child.proseIndex;
    const { noun } = this._deleteInfo(OUTLINE_TYPES.CONTENT, child);
    return html`
      <li class="block-item content-item content-child ${selected ? 'selected' : ''}"
          role="row" aria-level="3" aria-posinset="${i + 1}" aria-setsize="${siblings.length}"
          tabindex="-1" aria-selected="${selected}"
          data-child-prose="${child.proseIndex}"
          draggable="${this._canWrite}"
          @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.CONTENT, child)}
          @dragover=${(e) => this._onContentDragOver(e, child)}
          @pointermove=${this._onPickupPointer((e) => this._onContentDragOver(e, child))}
          @drop=${this._onDrop}
          @dragend=${this._onDragEnd}
          @click=${(e) => { e.stopPropagation(); this._selectProse(child.proseIndex, child.kind); }}>
        <div class="row-cell" role="gridcell">
          ${this._renderDragHandle(OUTLINE_TYPES.CONTENT, child, noun)}
          <span class="content-label-stack">
            <span class="block-name content-label">${label}</span>
            ${child.snippet ? html`<span class="content-snippet">${child.snippet}</span>` : nothing}
          </span>
          ${this._renderDeleteButton(OUTLINE_TYPES.CONTENT, child)}
        </div>
      </li>`;
  }

  _renderContentGroup(item, posinset, setsize) {
    const key = item.proseIndex;
    const expanded = !!this._expandedContent?.has(key);
    return html`
      <li class="content-group" role="none">
        <div class="block-item content-item" role="row"
             aria-level="2" aria-posinset="${posinset}" aria-setsize="${setsize}"
             tabindex="-1" aria-expanded="${expanded}"
             data-group-key="${key}"
             @click=${() => this._toggleContentGroup(key)}
             @dragover=${(e) => this._onContentGroupDragOver(e, item)}
             @pointermove=${this._onPickupPointer((e) => this._onContentGroupDragOver(e, item))}
             @drop=${this._onDrop}>
          <div class="row-cell" role="gridcell">
            <span class="block-name content-label">Default content</span>
          </div>
        </div>
        ${expanded ? html`
          <ul class="content-children" role="none">
            ${item.children.map((child, i) => this._renderContentChild(child, i, item.children))}
          </ul>` : nothing}
      </li>`;
  }

  _renderBlock(item, posinset, setsize) {
    const selected = this._selectedBlockIndex === item.blockIndex;
    const label = `${blockLabel(item)} block`;
    return html`
      <li class="block-item ${selected ? 'selected' : ''}" role="row"
          aria-level="2" aria-posinset="${posinset}" aria-setsize="${setsize}"
          data-block-index="${item.blockIndex}"
          tabindex="-1" aria-selected="${selected}"
          draggable="${this._canWrite}"
          @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.BLOCK, item.blockIndex)}
          @dragover=${(e) => this._onBlockDragOver(e, item.blockIndex)}
          @pointermove=${this._onPickupPointer((e) => this._onBlockDragOver(e, item.blockIndex))}
          @drop=${this._onDrop}
          @dragend=${this._onDragEnd}
          @click=${() => this._select(item.blockIndex)}>
        <div class="row-cell" role="gridcell">
          ${this._renderDragHandle(OUTLINE_TYPES.BLOCK, item.blockIndex, label)}
          <span class="block-name">${blockLabel(item)}</span>
          ${this._renderDeleteButton(OUTLINE_TYPES.BLOCK, item.blockIndex)}
        </div>
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
    const label = sectionLabel(sec);
    return html`<span class="section-label" title="${label}">${label}</span>`;
  }

  _renderSection(sec, sectionCount) {
    const editing = this._editingSection === sec.sectionIndex;
    const label = sectionLabel(sec);
    const setsize = sec.items.length;
    return html`
      <li class="outline-section" role="none"
          @dragover=${(e) => this._onSectionDragOver(e, sec)}
          @pointermove=${this._onPickupPointer((e) => this._onSectionDragOver(e, sec))}
          @dragleave=${this._onDragLeave}
          @drop=${this._onDrop}>
        <div class="section-header" data-section-header role="row"
             aria-level="1" aria-posinset="${sec.sectionIndex + 1}" aria-setsize="${sectionCount}"
             tabindex="-1"
             draggable="${this._canWrite && !editing}"
             @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.SECTION, sec.sectionIndex)}
             @dragend=${this._onDragEnd}>
          <div class="row-cell" role="gridcell">
            ${this._renderDragHandle(OUTLINE_TYPES.SECTION, sec.sectionIndex, label)}
            ${this._renderSectionLabel(sec)}
            ${this._renderSectionMenu(sec)}
          </div>
        </div>
        <ul class="block-list" role="none">
          ${setsize === 0
        ? html`<li class="block-item block-empty" role="row"
                    aria-level="2" aria-posinset="1" aria-setsize="1" tabindex="-1">
                <div class="row-cell" role="gridcell">
                  <span class="empty-label">Empty section</span>
                </div>
              </li>`
        : sec.items.map((item, i) => (item.type === 'block'
          ? this._renderBlock(item, i + 1, setsize)
          : this._renderContentGroup(item, i + 1, setsize)))}
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
        : html`<ul class="outline-list" role="treegrid" aria-label="Page outline"
                @keydown=${this._onGridKeydown}
                @focusin=${this._onGridFocusIn}
                @contextmenu=${this._onGridContextMenu}
                @click=${this._onGridClickCapture}
                @pointerleave=${this._onGridPointerLeave}>
              ${this._sections.map((sec) => this._renderSection(sec, this._sections.length))}
            </ul>`}
      </div>
      <div class="sr-only" aria-live="assertive" aria-atomic="true">${this._announcement ?? ''}</div>
      ${this._pendingDelete ? this._renderDeleteDialog() : nothing}
    </section>`;
  }
}

customElements.define('ew-page-outline', EwPageOutline);
