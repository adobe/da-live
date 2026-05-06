import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { initIms } from '../../../../shared/utils.js';
import { saveToAem } from '../../../utils/helpers.js';
import { isRegistered, getExistingSchedule, schedulePagePublish } from './utils.js';

const REGISTER_PATH = 'https://da.live/apps/scheduler';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaScheduler extends LitElement {
  static properties = {
    details: { attribute: false },
    _instructions: { state: true },
    _errorText: { state: true },
    _statusText: { state: true },
    _registered: { state: true },
    _scheduledTime: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.getScheduleStatus();
  }

  async getScheduleStatus() {
    const { org, site, path } = this.details;

    // Check registration
    this._statusText = 'Checking registration…';
    this._registered = await isRegistered(org, site);
    if (!this._registered) {
      this._statusText = null;
      this._instructions = html`
        <p>This site is not registered.</p>
        <p>Please register your site in the Scheduler App <a href="${REGISTER_PATH}"></a> first.</p>`;
      return;
    }

    // Check existing schedule
    this._statusText = 'Checking for schedule…';
    const schedule = await getExistingSchedule(org, site, path);
    if (schedule?.scheduled) {
      this._statusText = null;
      const d = new Date(schedule.scheduledPublish);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      this._scheduledTime = local.toISOString().slice(0, 16);
      const user = schedule.userId || 'Unknown';
      this._instructions = html`<p>Scheduled by ${user}. Reschedule?</p>`;
      return;
    }

    this._statusText = null;
    this._instructions = html`<p>Please select a publish time.</p>`;
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
    const { org, site, fullpath, path: shortPath } = this.details;
    const aemPath = fullpath.replace('.html', '');

    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
    const selected = new Date(this._scheduledTime);

    if (!this._scheduledTime || selected < fiveMinFromNow) {
      this._errorText = 'Please select a date and time at least 5 minutes in the future.';
      return;
    }

    this._statusText = 'Previewing…';
    const previewJson = await saveToAem(aemPath, 'preview');
    if (previewJson.error) {
      this._statusText = undefined;
      this._errorText = previewJson.error.message || 'Preview failed. Please try again.';
      return;
    }

    this._statusText = 'Scheduling…';
    const imsDetails = await initIms();
    const userId = imsDetails?.email;
    try {
      const resp = await schedulePagePublish(org, site, shortPath, userId, selected.toISOString());

      if (resp?.ok) {
        this._statusText = `Scheduled for ${selected.toLocaleString()}`;
        setTimeout(() => { this.handleClose(); }, 3000);
      } else {
        this._statusText = undefined;
        const message = resp.headers?.get('X-Error');
        this._errorText = message || 'Failed to schedule publish.';
      }
    } catch (e) {
      this._statusText = undefined;
      this._errorText = e.message || 'Failed to schedule publish.';
    }
  }

  get _timeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  get _disabled() {
    return !this._scheduledTime || this._statusText;
  }

  renderStatus() {
    const isError = !!this._errorText;
    return html`<p class="status-text ${isError ? 'is-error' : ''}">${this._errorText || this._statusText || nothing}</p>`;
  }

  render() {
    return html`
      <div class="content">
        ${this._instructions ? html`<div class="instructions">${this._instructions}</div>` : nothing}
      </div>
      <div class="date-footer">
        <sl-input
          type="datetime-local"
          label="Schedule (${this._timeZone})"
          .value=${this._scheduledTime}
          @input=${this.handleTimeChange}
          aria-label="Schedule date and time"></sl-input>
        <div class="footer">
          ${this.renderStatus()}
          <div class="actions">
            <sl-button @click=${this.handleSchedule} ?disabled=${this._disabled}>Schedule</sl-button>
          </div>
        </div>
      </div>`;
  }
}

customElements.define('da-scheduler', DaScheduler);

export default function render(details) {
  const cmp = document.createElement('da-scheduler');
  cmp.details = details;
  return cmp;
}
