import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { treeKeydown } from '../utils/tree-nav.js';
import { parseSections } from '../editor-utils/editor-utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { canvasBus } from '../utils/canvas-bus.js';
import {
  deleteBlock,
  deleteContentItem,
  deleteSection,
  insertBlockAtSectionStart,
  insertSection,
  moveBlock,
  moveBlockToContentItem,
  moveBlockToSection,
  moveContentItem,
  moveSection,
} from '../editor-utils/blocks.js';
import { fetchExtensions } from '../ew-panel-extensions/helpers.js';

const DELETE_ICON_SRC = '/img/icons/s2-icon-delete-20-n.svg';
const ADD_BLOCK_ICON_SRC = '/img/icons/s2-icon-tableadd-20-n.svg';
const ADD_SECTION_ICON_SRC = '/img/icons/s2-icon-addcircle-20-n.svg';
const DRAG_ICON_SRC = '/img/icons/s2-icon-draghandle-20-n.svg';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

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
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._expandedContent = new Set();
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
    this._unsubscribeHtml = canvasBus.editorHtmlState.subscribe((aemHtml) => {
      if (aemHtml.trim()) {
        const next = parseSections(aemHtml);
        if (!sectionsEqual(next, this._sections)) {
          this._sections = next;
          // A structural edit is the only time proseIndex-keyed expansion state can go
          // stale (positions shift), so this is the one point where it's safe to drop —
          // selection changes never do (see _expandRunForProse).
          this._expandedContent = new Set();
        }
      } else {
        this._sections = undefined;
        this._selectedBlockIndex = undefined;
        this._selectedProseIndex = undefined;
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

  get _selectedPath() {
    const { org, site, path } = this._hashState ?? {};
    return org && site && path ? `${org}/${site}/${path}` : '';
  }

  willUpdate() {
    const sp = this._selectedPath;
    if (this._prevSelectedPath !== undefined && sp !== this._prevSelectedPath) {
      this._sections = undefined;
      this._selectedBlockIndex = undefined;
      this._selectedProseIndex = undefined;
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

  async _checkBlockLibrary(org, site) {
    const extensions = await fetchExtensions(org, site);
    if (org !== this._hashState?.org || site !== this._hashState?.site) return;
    this._hasBlockLibrary = !!extensions?.find((ext) => ext.name === 'blocks');
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
    if (!_dropTarget || !_dragging) return;
    const { view } = getExtensionsBridge();

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

  async _openAddBlockModal(e, sectionIndex) {
    e.stopPropagation();
    e.preventDefault();
    const { view } = getExtensionsBridge();
    if (!view) return;
    const modulePath = '../ew-block-library-modal/ew-block-library-modal.js';
    const { openBlockLibraryModal } = await import(modulePath);
    const onInsert = (dom) => insertBlockAtSectionStart(view, dom, sectionIndex);
    openBlockLibraryModal({ onInsert });
  }

  _onAddSection(e) {
    e.stopPropagation();
    e.preventDefault();
    const { view } = getExtensionsBridge();
    if (!view) return;
    insertSection(view);
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

  _onDelete(e, type, index) {
    e.stopPropagation();
    e.preventDefault();
    const { view } = getExtensionsBridge();
    if (!view) return;
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

  _renderDeleteButton(type, index) {
    let noun = 'block';
    if (type === OUTLINE_TYPES.SECTION) noun = `section ${index + 1}`;
    else if (type === OUTLINE_TYPES.CONTENT) noun = contentChildLabel(index).toLowerCase();
    const label = `Delete ${noun}`;
    return html`
      <button type="button" class="action-btn delete-btn" draggable="false"
              aria-label="${label}"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => this._onDelete(e, type, index)}>
        <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
          <use href="${DELETE_ICON_SRC}#icon"></use>
        </svg>
      </button>`;
  }

  _renderContentGroup(item, isFirst) {
    const key = item.proseIndex;
    const expanded = this._expandedContent?.has(key);
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
            ${item.children.map((child) => html`
              <li class="block-item content-item content-child ${this._selectedProseIndex === child.proseIndex ? 'selected' : ''}"
                  role="treeitem" tabindex="-1"
                  aria-selected="${this._selectedProseIndex === child.proseIndex}"
                  draggable="true"
                  @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.CONTENT, child)}
                  @dragover=${(e) => this._onContentDragOver(e, child)}
                  @drop=${this._onDrop}
                  @dragend=${this._onDragEnd}
                  @click=${(e) => { e.stopPropagation(); this._selectProse(child.proseIndex, child.kind); }}>
                <span class="content-label-stack">
                  <span class="block-name content-label">${contentChildLabel(child)}</span>
                  ${child.snippet ? html`<span class="content-snippet">${child.snippet}</span>` : nothing}
                </span>
                ${this._renderDeleteButton(OUTLINE_TYPES.CONTENT, child)}
                <svg aria-hidden="true" class="icon drag" viewBox="0 0 20 20">
                  <use href="${DRAG_ICON_SRC}#icon"></use>
                </svg>
              </li>`)}
          </ul>` : nothing}
      </li>`;
  }

  _renderSection(sec, isFirstSection) {
    return html`
      <li class="outline-section" role="none"
          @dragover=${(e) => this._onSectionDragOver(e, sec)}
          @dragleave=${this._onDragLeave}
          @drop=${this._onDrop}>
        <div class="section-header" data-section-header
             draggable="true"
             @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.SECTION, sec.sectionIndex)}
             @dragend=${this._onDragEnd}>
          <span class="section-label">Section ${sec.sectionIndex + 1}</span>
          ${this._hasBlockLibrary ? html`
            <button type="button" class="action-btn add-block-btn" draggable="false"
                    aria-label="Add block to section ${sec.sectionIndex + 1}"
                    @pointerdown=${(e) => e.stopPropagation()}
                    @click=${(e) => this._openAddBlockModal(e, sec.sectionIndex)}>
              <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
                <use href="${ADD_BLOCK_ICON_SRC}#icon"></use>
              </svg>
            </button>` : nothing}
          ${this._renderDeleteButton(OUTLINE_TYPES.SECTION, sec.sectionIndex)}
          <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
                <use href="${DRAG_ICON_SRC}#icon"></use>
              </svg>
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
                draggable="true"
                @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.BLOCK, item.blockIndex)}
                @dragover=${(e) => this._onBlockDragOver(e, item.blockIndex)}
                @drop=${this._onDrop}
                @dragend=${this._onDragEnd}
                @click=${() => this._select(item.blockIndex)}>
              <span class="block-name">${item.name}${item.variant ? ` (${item.variant})` : ''}</span>
              ${this._renderDeleteButton(OUTLINE_TYPES.BLOCK, item.blockIndex)}
              <svg aria-hidden="true" class="icon drag" viewBox="0 0 20 20">
                <use href="${DRAG_ICON_SRC}#icon"></use>
              </svg>
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
                @keydown=${this._onTreeKeydown}>
              ${this._sections.map((sec, i) => this._renderSection(sec, i === 0))}
            </ul>
            <button type="button" class="add-section-btn" draggable="false"
                    aria-label="Add section"
                    @click=${(e) => this._onAddSection(e)}>
              <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
                <use href="${ADD_SECTION_ICON_SRC}#icon"></use>
              </svg>
              <span>Add section</span>
            </button>`}
      </div>
    </section>`;
  }
}

customElements.define('ew-page-outline', EwPageOutline);
