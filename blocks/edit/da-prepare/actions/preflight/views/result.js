import { LitElement, html } from 'da-lit';
import getSheet from '../../../../../shared/sheet.js';
import './label.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

// status: lifecycle (PENDING | DONE). result: outcome once done (ERROR | WARN | INFO |
// SUCCESS | NA, where NA means the check doesn't apply to this page). Badge/icon is
// derived from `result` by pf-label, not stored here.
export const STATUS = { PENDING: 'pending', DONE: 'done' };
export const SEVERITY = { ERROR: 'error', WARN: 'warn', INFO: 'info', SUCCESS: 'success', NA: 'na' };

// Every check item is a PreflightResult (or subclass, e.g. pf-link) — status/result/reason
// are plain reactive properties, not getters, so provider-registry.js's timeout sweep can
// call settle() on any item without knowing its subclass.
export default class PreflightResult extends LitElement {
  static properties = {
    status: { attribute: false },
    result: { attribute: false },
    reason: { attribute: false },
  };

  constructor() {
    super();
    this.status = STATUS.PENDING;
    // Explicit pending result/reason so a not-yet-settled item never renders undefined.
    this.result = STATUS.PENDING;
    this.reason = 'Check in progress.';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  settle(result, reason) {
    this.result = result;
    this.reason = reason;
    this.status = STATUS.DONE;
  }

  render() {
    return html`
      <div>${this.reason}</div>
      <pf-label .badge=${this.result}></pf-label>`;
  }
}

customElements.define('pf-result', PreflightResult);

// Providers/registry create items through this rather than the tag string directly.
export function createResult() {
  return document.createElement('pf-result');
}
