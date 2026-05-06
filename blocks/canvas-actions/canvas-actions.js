import { LitElement, html, nothing } from 'da-lit';

import {
  getNx, loadStyle, HashController,
  buildAemPathFromHashState, formatAemPreviewPublishError, runAemPreviewOrPublish,
} from '../shared/nxutils.js';

await import(`${getNx()}/blocks/shared/popover/popover.js`);

const style = await loadStyle(import.meta.url);

class NXCanvasActions extends LitElement {
  static properties = {
    _busy: { state: true },
    _error: { state: true },
  };

  _hash = new HashController(this);

  _busy = false;

  get _popover() {
    return this.shadowRoot?.querySelector('nx-popover');
  }

  get _menuAnchor() {
    return this.shadowRoot?.querySelector('.preview-dropdown-btn');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  get _hashState() {
    return this._hash.value;
  }

  _togglePreviewPopover(e) {
    e.preventDefault();
    if (!buildAemPathFromHashState(this._hashState) || this._busy) return;
    const pop = this._popover;
    const anchor = this._menuAnchor;
    if (!pop || !anchor) return;
    if (pop.open) {
      pop.close();
    } else {
      pop.show({ anchor, placement: 'below' });
      anchor.setAttribute('aria-expanded', 'true');
    }
  }

  _onSendPopoverClose() {
    this._menuAnchor?.setAttribute('aria-expanded', 'false');
  }

  _pickAem(action) {
    if (action !== 'preview' && action !== 'publish') return;
    this._popover?.close();
    this._runAemAction(action);
  }

  async _runAemAction(action) {
    const aemPath = buildAemPathFromHashState(this._hashState);
    if (!aemPath || this._busy) return;

    this._error = undefined;
    this._busy = true;

    const result = await runAemPreviewOrPublish({ aemPath, action });
    if (!result.ok) {
      this._error = formatAemPreviewPublishError(result.error);
      this._busy = false;
      return;
    }

    window.open(result.url, result.url);

    this._busy = false;
  }

  render() {
    const hasDoc = Boolean(buildAemPathFromHashState(this._hashState));
    const disabled = !hasDoc || this._busy;
    const sendIcon = html`<span class="preview-dropdown-icon" aria-hidden="true"><img src="/img/icons/s2-icon-send-20-n.svg" aria-hidden="true"></span>`;

    return html`
      <div class="canvas-actions">
        <div class="right">
          <div class="preview-row">
            <button
              type="button"
              class="preview-dropdown-btn"
              aria-label="Preview and publish"
              aria-haspopup="menu"
              aria-expanded="false"
              ?disabled=${disabled}
              @click=${this._togglePreviewPopover}
            >
              ${sendIcon}
            </button>
            <nx-popover placement="below" @close=${this._onSendPopoverClose}>
              <div class="send-popover" role="menu">
                <button type="button" class="send-popover-item" role="menuitem" @click=${() => this._pickAem('preview')}>
                  Preview
                </button>
                <button type="button" class="send-popover-item" role="menuitem" @click=${() => this._pickAem('publish')}>
                  Publish
                </button>
              </div>
            </nx-popover>
          </div>
          ${this._error ? html`<p class="action-error" role="alert">${this._error}</p>` : nothing}
        </div>
      </div>
    `;
  }
}

customElements.define('nx-canvas-actions', NXCanvasActions);
