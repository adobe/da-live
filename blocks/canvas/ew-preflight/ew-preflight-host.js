import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { peekPendingPreflightRequest } from '../editor-utils/preflight-responder.js';
import './ew-preflight.js';
import '../ew-panel-extensions/ew-panel-extensions.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const VIEW_ID = 'preflight';

// Preflight panel content when the org/site `prepare` sheet configures a custom Preflight.
// Shows the custom iframe by default, but an enforced publish (`preflightRunRequest`)
// always runs the built-in <ew-preflight>, the same as the modal did on main. It goes
// back to the custom content once the panel closes, or once the gate has settled and
// the user switches to another tool view.
class EwPreflightHost extends LitElement {
  static properties = {
    extension: { attribute: false },
    _builtin: { state: true },
  };

  constructor() {
    super();
    this._actionsZone = document.createElement('span');
    this._actionsZone.style.display = 'contents';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubs = [
      canvasBus.preflightRunRequest.subscribe(this._onRunRequest),
      canvasBus.preflightStatusState.subscribe(this._onStatus),
      canvasBus.toolPanelViewState.subscribe(this._onViewState),
    ];
    // A publish that opened this panel parks its request before we mount.
    const pending = peekPendingPreflightRequest();
    if (pending && !this._builtin) this._showBuiltin(pending.requestId);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubs?.forEach((unsub) => unsub());
    this._unsubs = null;
  }

  _onRunRequest = (detail) => {
    const { paths, requestId } = detail || {};
    if (!requestId || !Array.isArray(paths) || paths.length !== 1) return;
    this._showBuiltin(requestId);
  };

  _onStatus = ({ requestId } = {}) => {
    if (requestId && requestId === this._gateRequestId) this._gateSettled = true;
  };

  // `null` means the tools panel itself closed; other panels (e.g. chat) closing
  // re-broadcast the current view id and leave the built-in run alone.
  _onViewState = (id) => {
    if (!this._builtin) return;
    if (id === null) this._showCustom();
    else if (this._gateSettled && id !== VIEW_ID) this._showCustom();
  };

  _showBuiltin(requestId) {
    this._gateRequestId = requestId;
    this._gateSettled = false;
    if (this._builtin) return;
    // A fresh instance claims the parked request on its first connect.
    this._builtin = document.createElement('ew-preflight');
    this._syncHeaderActions();
  }

  _showCustom() {
    this._builtin = null;
    this._gateRequestId = null;
    this._gateSettled = false;
    this._syncHeaderActions();
  }

  _syncHeaderActions() {
    const actions = this._builtin?.getHeaderActions?.();
    this._actionsZone.replaceChildren(...(actions ? [actions] : []));
  }

  // Honored by the tool panel for first-party views (see tool-panel.js).
  getHeaderActions() {
    return this._actionsZone;
  }

  render() {
    return html`
      <ew-panel-extension
        ?hidden=${!!this._builtin}
        .extension=${this.extension}></ew-panel-extension>
      ${this._builtin ?? nothing}
    `;
  }
}

if (!customElements.get('ew-preflight-host')) {
  customElements.define('ew-preflight-host', EwPreflightHost);
}
