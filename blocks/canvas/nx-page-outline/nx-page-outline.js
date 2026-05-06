import { LitElement, html } from 'da-lit';
import { loadStyle, HashController } from '../../shared/nxutils.js';
import { editorHtmlChange, editorSelectChange } from '../editor-utils/document.js';

const style = await loadStyle(import.meta.url);

function parseSections(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const container = doc.querySelector('main') ?? doc.body;
  let flatIndex = 0;
  return Array.from(container.querySelectorAll(':scope > div'), (section, sectionIndex) => {
    const blocks = [];
    Array.from(section.querySelectorAll(':scope > div[class]')).forEach((el) => {
      const name = el.classList[0];
      if (!name || name === 'default-content-wrapper' || name === 'metadata') return;
      blocks.push({ name, blockFlatIndex: flatIndex });
      flatIndex += 1;
    });
    return { sectionIndex, blocks };
  });
}

function sectionsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((sec, i) => {
    const other = b[i];
    return sec.sectionIndex === other.sectionIndex
      && sec.blocks.length === other.blocks.length
      && sec.blocks.every((blk, j) => blk.name === other.blocks[j].name);
  });
}

class NxPageOutline extends LitElement {
  static properties = {
    _sections: { state: true },
    _selectedBlockFlatIndex: { state: true },
  };

  _hashCtrl = new HashController(this);

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubscribeHtml = editorHtmlChange.subscribe((aemHtml) => {
      if (aemHtml.trim()) {
        const next = parseSections(aemHtml);
        if (!sectionsEqual(next, this._sections)) this._sections = next;
      } else {
        this._sections = undefined;
        this._selectedBlockFlatIndex = undefined;
      }
    });
    this._unsubscribeSelect = editorSelectChange
      .subscribe(({ blockFlatIndex, source }) => {
        if (source === 'outline') return;
        this._selectedBlockFlatIndex = blockFlatIndex;
      });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHtml?.();
    this._unsubscribeSelect?.();
  }

  get _selectedPath() {
    const { org, site, path } = this._hashCtrl.value ?? {};
    return org && site && path ? `${org}/${site}/${path}` : '';
  }

  willUpdate() {
    const sp = this._selectedPath;
    if (this._prevSelectedPath !== undefined && sp !== this._prevSelectedPath) {
      this._sections = undefined;
      this._selectedBlockFlatIndex = undefined;
    }
    this._prevSelectedPath = sp;
  }

  _select(blockFlatIndex) {
    this._selectedBlockFlatIndex = blockFlatIndex;
    editorSelectChange.emit({ blockFlatIndex, source: 'outline' });
  }

  // Arrow function so `this` is correct when used as an event listener in the template.
  _onTreeKeydown = (e) => {
    const items = Array.from(this.shadowRoot.querySelectorAll('[role="treeitem"]'));
    if (!items.length) return;
    const idx = items.indexOf(this.shadowRoot.activeElement);
    if (idx === -1) return;

    let next = idx;
    switch (e.key) {
      case 'ArrowDown': next = Math.min(idx + 1, items.length - 1); break;
      case 'ArrowUp': next = Math.max(idx - 1, 0); break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }

    if (next !== idx) {
      e.preventDefault();
      items[idx].tabIndex = -1;
      items[next].tabIndex = 0;
      items[next].focus();
    }
  };

  _renderSection(sec, isFirstSection) {
    return html`
      <li class="nx-page-outline-section" role="none">
        <div class="nx-page-outline-section-header">
          <span class="nx-page-outline-section-label">Section ${sec.sectionIndex + 1}</span>
        </div>
        <ul class="nx-page-outline-block-list" role="group"
            aria-label="Blocks in section ${sec.sectionIndex + 1}">
          ${sec.blocks.length === 0
        ? html`<li class="nx-page-outline-block nx-page-outline-block-empty"
                    role="treeitem" tabindex="-1">
                <span class="nx-page-outline-empty-label">No blocks</span>
              </li>`
        : sec.blocks.map(({ name, blockFlatIndex }, blockIdx) => html`
      <li class="nx-page-outline-block" role="treeitem"
          tabindex="${isFirstSection && blockIdx === 0 ? '0' : '-1'}"
          aria-selected="${this._selectedBlockFlatIndex === blockFlatIndex}"
          @click=${() => this._select(blockFlatIndex)}>${name}</li>`)}
        </ul>
      </li>`;
  }

  render() {
    if (!this._selectedPath) {
      return html`<div class="nx-page-outline">
        <p class="nx-page-outline-placeholder">Select a page to see its outline.</p>
      </div>`;
    }

    return html`
    <section class="nx-page-outline">
      <div class="nx-page-outline-list-wrap">
        ${!this._sections
        ? html`<p class="nx-page-outline-placeholder">No blocks found.</p>`
        : html`<ul class="nx-page-outline-list" role="tree" aria-label="Page outline"
                @keydown=${this._onTreeKeydown}>
              ${this._sections.map((sec, i) => this._renderSection(sec, i === 0))}
            </ul>`}
      </div>
    </section>`;
  }
}

customElements.define('nx-page-outline', NxPageOutline);
