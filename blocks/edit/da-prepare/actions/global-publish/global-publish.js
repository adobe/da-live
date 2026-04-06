import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { getSatellites, checkOverrides } from '../../../../shared/msm.js';
import {
  previewSatellite,
  publishSatellite,
  createOverride,
  deleteOverride,
  mergeFromBase,
} from './utils.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

const STATUS = { pending: 'pending', success: 'success', error: 'error' };
const SYNC_MODE = { override: 'override', merge: 'merge' };

const ACTIONS = {
  preview: { label: 'Preview', scope: 'inherited' },
  publish: { label: 'Publish', scope: 'inherited' },
  break: { label: 'Cancel inheritance', scope: 'inherited' },
  sync: { label: 'Sync to satellite', scope: 'custom' },
  reset: { label: 'Resume inheritance', scope: 'custom' },
};

class DaGlobalPublish extends LitElement {
  static properties = {
    details: { attribute: false },
    _satellites: { state: true },
    _selected: { state: true },
    _loading: { state: true },
    _busy: { state: true },
    _confirmAction: { state: true },
    _action: { state: true },
    _syncMode: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._selected = new Set();
    this._action = 'preview';
    this._syncMode = SYNC_MODE.merge;
    this._busy = false;
    this.loadSatellites();
  }

  async loadSatellites() {
    const { org, site, path } = this.details;
    this._loading = 'Loading satellites\u2026';

    const satellites = await getSatellites(org, site);

    if (!satellites || !Object.keys(satellites).length) {
      this._satellites = [];
      this._loading = undefined;
      return;
    }

    this._loading = 'Checking overrides\u2026';
    const results = await checkOverrides(org, satellites, path);
    this._satellites = results.map((sat) => ({ ...sat, status: undefined }));
    this._loading = undefined;
  }

  get _inherited() {
    return this._satellites?.filter((s) => !s.hasOverride) || [];
  }

  get _custom() {
    return this._satellites?.filter((s) => s.hasOverride) || [];
  }

  get _targets() {
    const scope = ACTIONS[this._action]?.scope;
    const pool = scope === 'custom' ? this._custom : this._inherited;
    return pool.filter((s) => this._selected.has(s.site));
  }

  get _canApply() {
    return !this._busy && this._targets.length > 0;
  }

  handleToggle(site) {
    const next = new Set(this._selected);
    if (next.has(site)) next.delete(site);
    else next.add(site);
    this._selected = next;
  }

  updateSatStatus(site, status) {
    this._satellites = this._satellites.map(
      (s) => (s.site === site ? { ...s, status } : s),
    );
  }

  async apply() {
    if (!this._canApply) return;

    if (this._action === 'reset') {
      const names = this._targets.map((s) => s.label).join(', ');
      this._confirmAction = { message: `Resume inheritance for ${names}? This deletes local overrides.` };
      return;
    }

    await this.runAction(this._action);
  }

  cancelConfirm() {
    this._confirmAction = undefined;
  }

  async doConfirmedAction() {
    this._confirmAction = undefined;
    await this.runAction('reset');
  }

  async runAction(action) {
    this._busy = true;
    const { org, site, path } = this.details;
    const targets = this._targets;

    targets.forEach((s) => this.updateSatStatus(s.site, STATUS.pending));

    switch (action) {
      case 'preview':
      case 'publish': {
        const fn = action === 'publish' ? publishSatellite : previewSatellite;
        await Promise.allSettled(targets.map(async (sat) => {
          const result = await fn(org, sat.site, path);
          this.updateSatStatus(sat.site, result.error ? STATUS.error : STATUS.success);
        }));
        break;
      }

      case 'break':
        await Promise.allSettled(targets.map(async (sat) => {
          const result = await createOverride(org, site, sat.site, path);
          if (result.error) {
            this.updateSatStatus(sat.site, STATUS.error);
          } else {
            this._satellites = this._satellites.map(
              (s) => (s.site === sat.site
                ? { ...s, hasOverride: true, status: STATUS.success }
                : s),
            );
          }
        }));
        break;

      case 'sync':
        if (this._syncMode === SYNC_MODE.merge) {
          await Promise.allSettled(targets.map(async (sat) => {
            const result = await mergeFromBase(org, site, sat.site, path);
            if (result.error) {
              this.updateSatStatus(sat.site, STATUS.error);
            } else {
              this._satellites = this._satellites.map(
                (s) => (s.site === sat.site
                  ? { ...s, editUrl: result.editUrl, status: STATUS.success }
                  : s),
              );
            }
          }));
        } else {
          await Promise.allSettled(targets.map(async (sat) => {
            const result = await createOverride(org, site, sat.site, path);
            this.updateSatStatus(sat.site, result.error ? STATUS.error : STATUS.success);
          }));
        }
        break;

      case 'reset':
        await Promise.allSettled(targets.map(async (sat) => {
          const result = await deleteOverride(org, sat.site, path);
          if (result.error) {
            this.updateSatStatus(sat.site, STATUS.error);
          } else {
            this._satellites = this._satellites.map(
              (s) => (s.site === sat.site
                ? { ...s, hasOverride: false, status: STATUS.success }
                : s),
            );
            this._selected = new Set([...this._selected, sat.site]);
          }
        }));
        break;

      default:
        break;
    }

    this._busy = false;
  }

  renderStatusIcon(sat) {
    if (!sat.status) return nothing;
    if (sat.status === STATUS.pending) {
      return html`<svg class="result-icon pending" viewBox="0 0 20 20">
        <use href="/blocks/edit/img/S2_Icon_ClockPending_20_N.svg#S2_Icon_ClockPending"/>
      </svg>`;
    }
    if (sat.status === STATUS.success) {
      return html`<svg class="result-icon success" viewBox="0 0 20 20">
        <use href="/blocks/edit/img/S2_Icon_CheckmarkCircle_20_N.svg#S2_Icon_CheckmarkCircle"/>
      </svg>`;
    }
    return html`<svg class="result-icon error" viewBox="0 0 20 20">
      <use href="/blocks/edit/img/S2_Icon_AlertTriangle_20_N.svg#S2_Icon_AlertTriangle"/>
    </svg>`;
  }

  renderSatellite(sat) {
    const scope = ACTIONS[this._action]?.scope;
    const outOfScope = (scope === 'inherited') === sat.hasOverride;

    return html`
      <li class="sat-row ${outOfScope ? 'out-of-scope' : ''}">
        <label>
          <input type="checkbox"
            .checked=${this._selected.has(sat.site)}
            ?disabled=${this._busy || outOfScope}
            @change=${() => this.handleToggle(sat.site)} />
          <span>${sat.label}</span>
        </label>
        ${this.renderStatusIcon(sat)}
        ${sat.editUrl ? html`
          <a class="icon-btn" href=${sat.editUrl} target="_blank" title="Open in editor">
            <svg viewBox="0 0 20 20"><path fill="currentColor" d="M18.16 15.62V4.12c0-1.24-1.01-2.25-2.25-2.25H4.41c-1.24 0-2.25 1.01-2.25 2.25v3.72c0 .41.34.75.75.75s.75-.34.75-.75v-3.72c0-.41.34-.75.75-.75h11.5c.41 0 .75.34.75.75v11.5c0 .41-.34.75-.75.75h-3.81c-.41 0-.75.34-.75.75s.34.75.75.75h3.81c1.24 0 2.25-1.01 2.25-2.25z"/><path fill="currentColor" d="M11.16 9.62v4.24c0 .41-.34.75-.75.75s-.75-.34-.75-.75v-2.43l-6.47 6.47c-.15.15-.34.22-.53.22s-.38-.07-.53-.22a.754.754 0 010-1.06l6.47-6.47H6.17c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h4.24c.41 0 .75.34.75.75z"/></svg>
          </a>` : nothing}
      </li>`;
  }

  renderConfirm() {
    if (!this._confirmAction) return nothing;
    return html`
      <div class="confirm-box">
        <p>${this._confirmAction.message}</p>
        <div class="confirm-actions">
          <button class="confirm-btn" @click=${() => this.cancelConfirm()}>Cancel</button>
          <button class="confirm-btn danger" @click=${() => this.doConfirmedAction()}>Confirm</button>
        </div>
      </div>`;
  }

  renderActionControls() {
    return html`
      <div class="action-row">
        <div class="form-row">
          <label>Action</label>
          <div class="select-wrapper">
            <select class="action-select"
              aria-label="Action"
              .value=${this._action}
              ?disabled=${this._busy}
              @change=${(e) => { this._action = e.target.value; }}>
              <optgroup label="Inherited sites">
                <option value="preview">Preview</option>
                <option value="publish">Publish</option>
                <option value="break">Cancel inheritance</option>
              </optgroup>
              <optgroup label="Custom sites">
                <option value="sync">Sync to satellite</option>
                <option value="reset">Resume inheritance</option>
              </optgroup>
            </select>
          </div>
        </div>
        ${this._action === 'sync' ? html`
          <div class="form-row">
            <label>Sync mode</label>
            <div class="select-wrapper">
              <select class="action-select"
                aria-label="Sync mode"
                .value=${this._syncMode}
                ?disabled=${this._busy}
                @change=${(e) => { this._syncMode = e.target.value; }}>
                <option value="merge">Merge</option>
                <option value="override">Override</option>
              </select>
            </div>
          </div>` : nothing}
      </div>`;
  }

  renderList() {
    const inherited = this._inherited;
    const custom = this._custom;

    return html`
      <div class="satellite-grid">
        ${inherited.length ? html`
          <div class="satellite-column">
            <p class="column-heading">Inherited</p>
            <ul class="satellite-list" role="group" aria-label="Inherited satellites">
              ${inherited.map((sat) => this.renderSatellite(sat))}
            </ul>
          </div>` : nothing}
        ${custom.length ? html`
          <div class="satellite-column">
            <p class="column-heading">Custom</p>
            <ul class="satellite-list" role="group" aria-label="Custom satellites">
              ${custom.map((sat) => this.renderSatellite(sat))}
            </ul>
          </div>` : nothing}
      </div>`;
  }

  render() {
    if (this._loading) {
      return html`<p class="loading">${this._loading}</p>`;
    }

    if (!this._satellites?.length) {
      return html`<p class="no-satellites">No satellite sites configured for this base.</p>`;
    }

    return html`
      ${this.renderActionControls()}
      ${this.renderList()}
      ${this.renderConfirm()}
      <div class="form-actions">
        <sl-button class="accent"
          @click=${() => this.apply()}
          ?disabled=${!this._canApply}>Apply</sl-button>
      </div>`;
  }
}

customElements.define('da-global-publish', DaGlobalPublish);

export default function render(details) {
  const cmp = document.createElement('da-global-publish');
  cmp.details = details;
  return cmp;
}
