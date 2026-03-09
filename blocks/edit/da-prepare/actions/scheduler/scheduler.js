import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { initIms } from '../../../../shared/utils.js';
import { saveToAem } from '../../../utils/helpers.js';
import { isRegistered, schedulePagePublish } from './utils.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaScheduler extends LitElement {
  static properties = {
    details: { attribute: false },
    _statusText: { state: true },
    _scheduledTime: { state: true },
    _errorText: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  handleClose() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('close', opts);
    this.dispatchEvent(event);
  }

  handleTimeChange({ target }) {
    this._scheduledTime = target.value;
    this._errorText = undefined;
  }

  async handleSchedule() {
    const { org, site, path, view } = this.details;
    const { hash } = window.location;
    const pathname = hash.replace('#', '');
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
    const selected = new Date(this._scheduledTime);

    if (!this._scheduledTime || selected < fiveMinFromNow) {
      this._errorText = 'Please select a date and time at least 5 minutes in the future.';
      return;
    }

    this._errorText = undefined;
    this._statusText = 'Checking registration…';

    const registered = await isRegistered(org, site);
    if (!registered) {
      this._statusText = undefined;
      this._errorText = 'This site is not registered for scheduled publishing.';
      return;
    }

    this._statusText = 'Previewing…';
    const aemPath = view === 'sheet' ? `${pathname}.json` : pathname;
    const previewJson = await saveToAem(aemPath, 'preview');
    if (previewJson.error) {
      this._statusText = undefined;
      this._errorText = previewJson.error.message || 'Preview failed. Please try again.';
      return;
    }

    this._statusText = 'Scheduling…';
    const imsDetails = await initIms();
    const userId = imsDetails?.email;
    const pagePath = view === 'sheet' ? `${path}.json` : path;

    try {
      this._statusText = undefined;
      const resp = await schedulePagePublish(org, site, pagePath, userId, selected.toISOString());

      if (resp?.ok) {
        this._statusText = `Scheduled for ${selected.toLocaleString()}`;
        setTimeout(() => { this.handleClose(); }, 3000);
      } else {
        const message = resp.headers?.get('X-Error');
        this._errorText = message || 'Failed to schedule publish.';
      }
    } catch (e) {
      this._errorText = e.message || 'Failed to schedule publish.';
    }
  }

  get _disabled() {
    return !this._scheduledTime || this._statusText;
  }

  render() {
    return html`
      <div class="content">
        <p>Choose when to publish this page.</p>
        <sl-input
          type="datetime-local"
          @input=${this.handleTimeChange}
          aria-label="Schedule date and time"></sl-input>
        ${this._errorText ? html`<p class="error-text">${this._errorText}</p>` : nothing}
      </div>
      <div class="footer">
        <p class="status-text">${this._statusText || nothing}</p>
        <sl-button @click=${this.handleSchedule} ?disabled=${this._disabled}>Schedule</sl-button>
      </div>`;
  }
}

customElements.define('da-scheduler', DaScheduler);

export default function render(details) {
  const cmp = document.createElement('da-scheduler');
  cmp.details = details;
  return cmp;
}
