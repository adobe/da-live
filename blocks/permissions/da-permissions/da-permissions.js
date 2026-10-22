import { LitElement, html } from 'da-lit';

/**
 * Container component for the permissions block. Receives the current
 * `org`/`site` route and (in Task 5) renders the permissions table.
 */
class DaPermissions extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
  };

  render() {
    return html``;
  }
}

if (!customElements.get('da-permissions')) {
  customElements.define('da-permissions', DaPermissions);
}

export default DaPermissions;
