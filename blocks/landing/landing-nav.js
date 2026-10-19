import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

export class DaLandingNav extends LitElement {
  static properties = {
    _error: { state: true },
    _notificationsOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  firstUpdated() {
    this.loadActions();
  }

  async loadActions() {
    try {
      await Promise.all([
        import(`${getNx()}/blocks/whatsnew/whatsnew.js`),
        import(`${getNx()}/blocks/feedback/feedback.js`),
      ]);
    } catch (error) {
      if (this.isConnected) this._error = `Could not load navigation actions: ${error.message}`;
    }
  }

  render() {
    return html`
      <button type="button" popovertarget="notifications" aria-haspopup="dialog"
        aria-expanded=${!!this._notificationsOpen}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-bell-20-n.svg#icon"></use></svg>
        <span class="action-label">Notification</span>
      </button>
      <div class="divider" aria-hidden="true"></div>
      <nx-whatsnew label></nx-whatsnew>
      <nx-feedback></nx-feedback>
      <div id="notifications" popover="auto" role="dialog" aria-labelledby="notification-heading"
        @toggle=${({ newState }) => { this._notificationsOpen = newState === 'open'; }}>
        <div class="popover-heading">
          <h2 id="notification-heading">Notifications</h2>
          <button type="button" popovertarget="notifications" popovertargetaction="hide" aria-label="Close notifications">&#215;</button>
        </div>
        <p role="status">Notifications are not connected in this preview.</p>
      </div>
      ${this._error ? html`<p class="action-error" role="alert">${this._error}</p>` : nothing}
    `;
  }
}

customElements.define('da-landing-nav', DaLandingNav);
