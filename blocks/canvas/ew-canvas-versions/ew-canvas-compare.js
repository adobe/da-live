import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const ICON_CLOSE = '/img/icons/s2-icon-close-20-n.svg';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);
const style = await loadStyle(import.meta.url);
const baseStyle = await loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href);

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
    label: { type: String },
    canWrite: { type: Boolean },
    split: { type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [baseStyle, style];
    this._onKeydown = (e) => { if (e.key === 'Escape') this._close(); };
    document.addEventListener('keydown', this._onKeydown);
  }

  firstUpdated() {
    const popover = this.shadowRoot.querySelector('nx-popover');
    popover.persistent = true;
    popover.show();
    this._reposition();

    const section = getCanvasSection();
    if (section) {
      this._resizeObserver = new ResizeObserver(() => this._reposition());
      this._resizeObserver.observe(section);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeydown);
    this._resizeObserver?.disconnect();
  }

  _reposition() {
    const section = getCanvasSection();
    const popover = this.shadowRoot.querySelector('nx-popover');
    if (!section || !popover) return;
    // Union with the chat panel's rect (if open) so the popover covers it too,
    // since the panel sits outside the canvas section in the DOM.
    const sectionRect = section.getBoundingClientRect();
    const chatRect = getChatPanel()?.getBoundingClientRect();
    const left = Math.min(sectionRect.left, chatRect?.left ?? Infinity);
    const top = Math.min(sectionRect.top, chatRect?.top ?? Infinity);
    const right = Math.max(sectionRect.right, chatRect?.right ?? -Infinity);
    const bottom = Math.max(sectionRect.bottom, chatRect?.bottom ?? -Infinity);
    // Overhang slightly on every side so the section's own border never peeks out
    // from behind the popover's rounded corners — sizing exactly to the rect left
    // a sliver of it visible at each corner.
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

  get _panes() {
    if (!this.diffDom) return null;
    if (this._panesCache?.source === this.diffDom) return this._panesCache;
    const current = this.diffDom.cloneNode(true);
    current.querySelectorAll('ins').forEach((el) => el.remove());
    const version = this.diffDom.cloneNode(true);
    version.querySelectorAll('del').forEach((el) => el.remove());
    this._panesCache = { source: this.diffDom, current, version };
    return this._panesCache;
  }

  render() {
    const panes = this.split ? this._panes : null;
    return html`
      <nx-popover>
        <div class="ew-cc-header">
          ${panes ? html`
            <div class="ew-cc-chip-row">
              <div class="ew-cc-chip-slot"><span class="ew-cc-chip is-neutral">Current</span></div>
              <div class="ew-cc-chip-slot"><span class="ew-cc-chip">${this.label}</span></div>
            </div>
          ` : html`<span class="ew-cc-chip">${this.label}</span>`}
          <div class="ew-cc-actions">
            <button type="button" class="da-btn-secondary${this.split ? ' is-active' : ''}"
              aria-label="Toggle split view" aria-pressed=${this.split ? 'true' : 'false'}
              @click=${this._toggleSplit}>
              Compare
            </button>
            ${this.canWrite ? html`
              <button type="button" class="da-btn-secondary" @click=${this._restore}>Restore</button>
            ` : nothing}
            <button type="button" class="da-icon-btn" aria-label="Close" @click=${this._close}>
              <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
                <use href="${ICON_CLOSE}#icon"></use>
              </svg>
            </button>
          </div>
        </div>
        ${panes ? html`
          <div class="ew-cc-split">
            <div class="ew-cc-pane ProseMirror">${panes.current}</div>
            <div class="ew-cc-pane ProseMirror">${panes.version}</div>
          </div>
        ` : html`
          <div class="ew-cc-body ProseMirror">${this.dom}</div>
        `}
      </nx-popover>
    `;
  }
}

customElements.define('ew-canvas-compare', EwCanvasCompare);
