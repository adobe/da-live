import { LitElement, html } from 'da-lit';
import getSheet from '../../../../../shared/sheet.js';
import './label.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

// Shared vocabulary for provider results (preflight.js, providers/provider-registry.js).
// Three separate concerns, kept as separate fields:
// - status: lifecycle - is this item done yet (PENDING | DONE).
// - result: outcome - what did the check conclude, once done (ERROR | WARN | INFO | SUCCESS | NA).
//   NA means the check doesn't apply to this page (not a real failure/finding).
// - badge: presentation - which visual badge to show. Currently 1:1 with `result`, but kept as
//   its own field/value-space so a check can set it independently if that ever changes.
export const STATUS = { PENDING: 'pending', DONE: 'done' };
export const SEVERITY = { ERROR: 'error', WARN: 'warn', INFO: 'info', SUCCESS: 'success', NA: 'na' };

// The only result shape: preflight.js/provider-registry.js never build plain result objects,
// every check item is a PreflightResult (this class directly, or a richer subclass e.g. a
// future pf-link). status/result/badge/reason are plain reactive properties (not getters) so
// provider-registry.js's timeout sweep can call settle() on any item without knowing its subclass.
export default class PreflightResult extends LitElement {
  static properties = {
    status: { attribute: false },
    result: { attribute: false },
    badge: { attribute: false },
    reason: { attribute: false },
  };

  constructor() {
    super();
    this.status = STATUS.PENDING;
    // Explicit pending badge/reason so a not-yet-settled item never renders undefined.
    this.badge = STATUS.PENDING;
    this.reason = 'Check in progress.';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  settle(result, badge, reason) {
    this.result = result;
    this.badge = badge;
    this.reason = reason;
    this.status = STATUS.DONE;
  }

  render() {
    return html`
      <div>${this.reason}</div>
      <pf-label .badge=${this.badge}></pf-label>`;
  }
}

customElements.define('pf-result', PreflightResult);

// Providers/registry create items through this rather than the tag string directly.
export function createResult() {
  return document.createElement('pf-result');
}
