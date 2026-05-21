import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { treeKeydown } from '../utils/tree-nav.js';
import { editorHtmlChange, editorSelectChange, parseSections } from '../editor-utils/editor-utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { moveBlock, moveSection } from '../editor-utils/blocks.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const OUTLINE_TYPES = {
  SECTION: 'section',
  BLOCK: 'block',
};

const DROP_POSITIONS = {
  BEFORE: 'before',
  AFTER: 'after',
};

function sectionsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((sec, i) => {
    const other = b[i];
    return sec.sectionIndex === other.sectionIndex
      && sec.blocks.length === other.blocks.length
      && sec.blocks.every((blk, j) => blk.name === other.blocks[j].name);
  });
}

class EwPageOutline extends LitElement {
  static properties = {
    _sections: { state: true },
    _selectedBlockIndex: { state: true },
    _hashState: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
    this._unsubscribeHtml = editorHtmlChange.subscribe((aemHtml) => {
      if (aemHtml.trim()) {
        const next = parseSections(aemHtml);
        if (!sectionsEqual(next, this._sections)) this._sections = next;
      } else {
        this._sections = undefined;
        this._selectedBlockIndex = undefined;
      }
    });
    this._unsubscribeSelect = editorSelectChange
      .subscribe(({ blockIndex, source }) => {
        if (source === 'outline') return;
        this._selectedBlockIndex = blockIndex;
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
    }
    this._prevSelectedPath = sp;
  }

  _select(blockIndex) {
    this._selectedBlockIndex = blockIndex;
    editorSelectChange.emit({ blockIndex, source: 'outline' });
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
    const rect = e.currentTarget.getBoundingClientRect();
    const dropPosition = e.clientY < rect.top + rect.height / 2
      ? DROP_POSITIONS.BEFORE : DROP_POSITIONS.AFTER;

    if (this._dragging?.type === OUTLINE_TYPES.SECTION) {
      if (this._dragging.index === sec.sectionIndex) return;
      e.preventDefault();

      const el = dropPosition === DROP_POSITIONS.BEFORE
        ? e.currentTarget.querySelector('[data-section-header]')
        : e.currentTarget;

      this._setDropIndicator(el, { sectionIndex: sec.sectionIndex, dropPosition });
    } else {
      if (!sec.blocks.length) return;
      if (sec.blocks.some((b) => b.blockIndex === this._dragging?.index)) return;
      const { blockIndex } = sec.blocks[sec.blocks.length - 1];
      e.preventDefault();

      const lastBlockEl = this.shadowRoot.querySelector(`[data-block-index="${blockIndex}"]`);
      if (!lastBlockEl) return;
      this._setDropIndicator(lastBlockEl, { blockIndex, dropPosition: DROP_POSITIONS.AFTER });
    }
  }

  _onBlockDragOver(e, blockIndex) {
    if (this._dragging?.type !== OUTLINE_TYPES.BLOCK || this._dragging.index === blockIndex) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const dropPosition = e.clientY < rect.top + rect.height / 2
      ? DROP_POSITIONS.BEFORE : DROP_POSITIONS.AFTER;
    this._setDropIndicator(e.currentTarget, { blockIndex, dropPosition });
  }

  _onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { _dragging, _dropTarget } = this;
    this._clearDragState();
    if (!_dropTarget || !_dragging) return;
    const { view } = getExtensionsBridge();
    if (_dropTarget.blockIndex != null) {
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

  _onTreeKeydown = (e) => treeKeydown(e, this.shadowRoot);

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
        </div>
        <ul class="block-list" role="group"
            aria-label="Blocks in section ${sec.sectionIndex + 1}">
          ${sec.blocks.length === 0
        ? html`<li class="block-item block-empty"
                    role="treeitem" tabindex="-1">
                <span class="empty-label">No blocks</span>
              </li>`
        : sec.blocks.map(({ name, blockIndex }, blockIdx) => html`
            <li class="block-item" role="treeitem"
                data-block-index="${blockIndex}"
                tabindex="${isFirstSection && blockIdx === 0 ? '0' : '-1'}"
                aria-selected="${this._selectedBlockIndex === blockIndex}"
                draggable="true"
                @dragstart=${(e) => this._onDragStart(e, OUTLINE_TYPES.BLOCK, blockIndex)}
                @dragover=${(e) => this._onBlockDragOver(e, blockIndex)}
                @drop=${this._onDrop}
                @dragend=${this._onDragEnd}
                @click=${() => this._select(blockIndex)}>${name}</li>`)}
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
            </ul>`}
      </div>
    </section>`;
  }
}

customElements.define('ew-page-outline', EwPageOutline);
