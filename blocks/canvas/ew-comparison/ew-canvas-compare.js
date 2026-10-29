import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getRenderableSrc } from '../ew-editor-doc/prose-plugins/mediaBusImage.js';

const ICON_CLOSE = '/img/icons/s2-icon-close-20-n.svg';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);
const style = await loadStyle(import.meta.url);
const buttons = await loadStyle(`${getNx2()}/styles/buttons.css`);

function getCanvasSection() {
  return document.querySelector('ew-canvas-header')?.parentElement
    ?? document.querySelector('.nx-canvas-editor-mount');
}

function getChatPanel() {
  return document.querySelector('aside.panel[data-position="before"]:not([hidden])');
}

class EwCanvasCompare extends LitElement {
  static properties = {
    dom: { attribute: false },
    diffDom: { attribute: false },
    path: { type: String },
    label: { type: String },
    canWrite: { type: Boolean },
    split: { type: Boolean },
    embedded: { type: Boolean, reflect: true },
    currentLabel: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, style];
    this._onKeydown = (e) => {
      if (this.embedded) return;
      if (e.key === 'Escape') {
        this._close();
        return;
      }
      if (e.key === 'Tab') this._trapFocus(e);
    };
    document.addEventListener('keydown', this._onKeydown);
  }

  get _popover() { return this.shadowRoot.querySelector('nx-popover'); }

  async firstUpdated() {
    if (this.embedded) return;
    const popover = this._popover;
    popover.persistent = true;
    popover.show();
    this._reposition();

    const section = getCanvasSection();
    if (section) {
      this._resizeObserver = new ResizeObserver(() => this._reposition());
      this._resizeObserver.observe(section);
    }

    await popover.updateComplete;
    this.shadowRoot.querySelector('.ew-cc-close-btn')?.focus();
  }

  _trapFocus(e) {
    const focusable = Array.from(this.shadowRoot.querySelectorAll('button:not([disabled])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.shadowRoot.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeydown);
    this._resizeObserver?.disconnect();
  }

  _reposition() {
    const section = getCanvasSection();
    const popover = this._popover;
    if (!section || !popover) return;
    const sectionRect = section.getBoundingClientRect();
    const chatRect = getChatPanel()?.getBoundingClientRect();
    const left = Math.min(sectionRect.left, chatRect?.left ?? Infinity);
    const top = Math.min(sectionRect.top, chatRect?.top ?? Infinity);
    const right = Math.max(sectionRect.right, chatRect?.right ?? -Infinity);
    const bottom = Math.max(sectionRect.bottom, chatRect?.bottom ?? -Infinity);
    Object.assign(popover.style, {
      top: `${top}px`,
      left: `${left}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
    });
  }

  _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  _restore() {
    this.dispatchEvent(new CustomEvent('restore', { bubbles: true, composed: true }));
  }

  _toggleSplit() {
    this.dispatchEvent(new CustomEvent('toggle-split', { bubbles: true, composed: true }));
  }

  _displayDom(source) {
    const dom = source.cloneNode(true);
    const [, org, repo] = (this.path ?? '').split('/');
    dom.querySelectorAll('img').forEach((img) => {
      const src = getRenderableSrc(img.getAttribute('src'), { org, repo });
      if (src) img.setAttribute('src', src);
    });
    return dom;
  }

  get _preview() {
    if (!this.dom) return null;
    if (this._previewCache?.source === this.dom && this._previewCache.path === this.path) {
      return this._previewCache.dom;
    }
    const dom = this._displayDom(this.dom);
    this._previewCache = { source: this.dom, path: this.path, dom };
    return dom;
  }

  get _diffPreview() {
    if (this._diffPreviewCache?.source === this.diffDom
      && this._diffPreviewCache.path === this.path) return this._diffPreviewCache.dom;
    const dom = this._displayDom(this.diffDom);
    this._diffPreviewCache = { source: this.diffDom, path: this.path, dom };
    return dom;
  }

  get _panes() {
    if (!this.diffDom) return null;
    if (this._panesCache?.source === this.diffDom
      && this._panesCache.embedded === this.embedded
      && this._panesCache.path === this.path) return this._panesCache;
    if (!this.embedded) {
      const current = this._displayDom(this.diffDom);
      current.querySelectorAll('ins').forEach((el) => el.remove());
      const version = this._displayDom(this.diffDom);
      version.querySelectorAll('del').forEach((el) => el.remove());
      const { diffDom: source, path } = this;
      this._panesCache = { source, embedded: false, path, current, version };
      return this._panesCache;
    }
    const rows = [...this._displayDom(this.diffDom).childNodes]
      .filter((node) => node.nodeType !== Node.TEXT_NODE || node.textContent.trim())
      .map((node) => {
        const cloneWithout = (tag) => {
          if (node.nodeType === Node.ELEMENT_NODE && node.localName === tag) return null;
          const clone = node.cloneNode(true);
          clone.querySelectorAll?.(tag).forEach((el) => el.remove());
          return clone;
        };
        return { current: cloneWithout('ins'), version: cloneWithout('del') };
      });
    this._panesCache = { source: this.diffDom, embedded: true, path: this.path, rows };
    return this._panesCache;
  }

  renderContent() {
    const panes = this.split ? this._panes : null;
    return html`
        <div class="ew-cc-header">
          ${panes || (this.embedded && this.diffDom) ? html`
            <div class="ew-cc-chip-row">
              <div class="ew-cc-chip-slot"><span class="ew-cc-chip is-neutral">${this.currentLabel || 'Current'}</span></div>
              <div class="ew-cc-chip-slot"><span class="ew-cc-chip">${this.label}</span></div>
            </div>
          ` : html`<span class="ew-cc-chip">${this.label}</span>`}
          <div class="ew-cc-actions">
            <button type="button" class="nx-action-btn nx-btn-sm${this.split ? ' is-active' : ''}"
              aria-pressed=${this.split ? 'true' : 'false'}
              @click=${this._toggleSplit}>
              ${this.embedded ? 'Side by side' : 'Compare'}
            </button>
            ${this.canWrite ? html`
              <button type="button" class="nx-action-btn nx-btn-sm" @click=${this._restore}>Restore</button>
            ` : nothing}
            <button type="button" class="nx-action-btn-icon nx-btn-sm ew-cc-close-btn" aria-label="Close" @click=${this._close}>
              <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
                <use href="${ICON_CLOSE}#icon"></use>
              </svg>
            </button>
          </div>
        </div>
        ${panes ? html`
          <div class="ew-cc-split${this.embedded ? ' is-aligned' : ''}">
            ${this.embedded ? panes.rows.map((row) => html`
              <div class="ew-cc-pane ProseMirror">${row.current}</div>
              <div class="ew-cc-pane ProseMirror">${row.version}</div>
            `) : html`
              <div class="ew-cc-pane ProseMirror">${panes.current}</div>
              <div class="ew-cc-pane ProseMirror">${panes.version}</div>
            `}
          </div>
        ` : html`
          <div class="ew-cc-body ProseMirror">${this.embedded && this.diffDom ? this._diffPreview : this._preview}</div>
        `}
    `;
  }

  render() {
    return this.embedded
      ? html`<section class="ew-cc-embedded" role="region" aria-label="Content comparison">${this.renderContent()}</section>`
      : html`<nx-popover role="dialog" aria-modal="true" aria-label="Compare with ${this.label}">${this.renderContent()}</nx-popover>`;
  }
}

customElements.define('ew-canvas-compare', EwCanvasCompare);
