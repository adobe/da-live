import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { getSatellites, getBaseSite, isPageLocal, checkOverrides } from '../../../../shared/msm.js';
import {
  previewSatellite,
  publishSatellite,
  createOverride,
  deleteOverride,
  mergeFromBase,
  getSatellitePageStatus,
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

class DaMsm extends LitElement {
  static properties = {
    details: { attribute: false },
    _satellites: { state: true },
    _selected: { state: true },
    _loading: { state: true },
    _busy: { state: true },
    _confirmAction: { state: true },
    _action: { state: true },
    _syncMode: { state: true },
    _role: { state: true },
    _baseSite: { state: true },
    _hasOverride: { state: true },
    _satStatus: { state: true },
    _openPicker: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._loading = 'Loading\u2026';
    this._selected = new Set();
    this._action = 'preview';
    this._syncMode = SYNC_MODE.merge;
    this._busy = false;
    this._openPicker = null;
    this._handleOutsidePickerClick = this._handleOutsidePickerClick.bind(this);
    this.loadSatellites();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._handleOutsidePickerClick);
  }

  _handleOutsidePickerClick(e) {
    if (!e.composedPath().includes(this)) {
      this._openPicker = null;
      document.removeEventListener('pointerdown', this._handleOutsidePickerClick);
    }
  }

  togglePicker(name) {
    if (this._openPicker === name) {
      this._openPicker = null;
      document.removeEventListener('pointerdown', this._handleOutsidePickerClick);
    } else {
      this._openPicker = name;
      document.addEventListener('pointerdown', this._handleOutsidePickerClick);
    }
  }

  selectPickerOption(name, value, setter) {
    setter(value);
    this._openPicker = null;
    document.removeEventListener('pointerdown', this._handleOutsidePickerClick);
  }

  async loadSatellites() {
    const { org, site, path } = this.details;
    this._loading = 'Loading configuration\u2026';

    const satellites = await getSatellites(org, site);

    if (satellites && Object.keys(satellites).length) {
      this._role = 'base';
      this._loading = 'Checking overrides\u2026';
      const results = await checkOverrides(org, satellites, path);
      this._satellites = results.map((sat) => ({ ...sat, status: undefined }));
      this._loading = undefined;
      return;
    }

    const baseSite = await getBaseSite(org, site);
    if (baseSite) {
      this._role = 'satellite';
      this._baseSite = baseSite;
      this._action = 'sync-from-base';
      this._hasOverride = await isPageLocal(org, site, path);
      this._loading = undefined;
      return;
    }

    this._satellites = [];
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
    if (this._role === 'satellite') {
      this.applySatelliteAction();
      return;
    }

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
    const { confirmedAction } = this._confirmAction || {};
    this._confirmAction = undefined;
    if (confirmedAction === 'resume-inheritance') {
      await this.runSatelliteAction('resume-inheritance');
    } else {
      await this.runAction('reset');
    }
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
          const pageStatus = await getSatellitePageStatus(org, sat.site, path);
          const result = await deleteOverride(org, sat.site, path);
          if (result.error) {
            this.updateSatStatus(sat.site, STATUS.error);
          } else {
            if (pageStatus.live) {
              await previewSatellite(org, sat.site, path);
              await publishSatellite(org, sat.site, path);
            } else if (pageStatus.preview) {
              await previewSatellite(org, sat.site, path);
            }
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

  applySatelliteAction() {
    if (this._busy) return;

    if (this._action === 'resume-inheritance') {
      this._confirmAction = {
        message: 'Resume inheritance? This deletes the local override.',
        confirmedAction: 'resume-inheritance',
      };
      return;
    }

    this.runSatelliteAction(this._action);
  }

  async runSatelliteAction(action) {
    this._busy = true;
    this._satStatus = STATUS.pending;
    const { org, site, path } = this.details;

    try {
      let result;
      if (action === 'sync-from-base') {
        result = this._syncMode === SYNC_MODE.merge
          ? await mergeFromBase(org, this._baseSite, site, path)
          : await createOverride(org, this._baseSite, site, path);
      } else if (action === 'resume-inheritance') {
        const pageStatus = await getSatellitePageStatus(org, site, path);
        result = await deleteOverride(org, site, path);
        if (!result?.error) {
          if (pageStatus.live) {
            await previewSatellite(org, site, path);
            await publishSatellite(org, site, path);
          } else if (pageStatus.preview) {
            await previewSatellite(org, site, path);
          }
        }
      }

      if (result?.error) {
        this._satStatus = STATUS.error;
      } else {
        this._satStatus = STATUS.success;
        if (action === 'resume-inheritance') {
          this._hasOverride = false;
        } else {
          this._hasOverride = true;
        }
      }
    } catch {
      this._satStatus = STATUS.error;
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

  renderPicker(name, label, value, options, setter) {
    const isOpen = this._openPicker === name;
    const selectedLabel = options
      .flatMap((o) => o.items || [o])
      .find((o) => o.value === value)?.label || '';

    return html`
      <div class="form-row">
        <label>${label}</label>
        <div class="picker-wrapper">
          <button class="picker-trigger ${isOpen ? 'open' : ''}"
            aria-haspopup="listbox"
            aria-expanded=${isOpen}
            ?disabled=${this._busy}
            @click=${() => this.togglePicker(name)}>
            <span class="picker-label">${selectedLabel}</span>
            <svg class="picker-chevron" viewBox="0 0 10 10">
              <path d="M1 3.5 5 7.5 9 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          ${isOpen ? html`
            <ul class="picker-menu" role="listbox" aria-label=${label}>
              ${options.map((group) => {
    if (group.items) {
      return html`
                    <li class="picker-group-header" role="presentation">${group.heading}</li>
                    ${group.items.map((opt) => html`
                      <li class="picker-item ${opt.value === value ? 'selected' : ''}"
                        role="option"
                        aria-selected=${opt.value === value}
                        @click=${() => this.selectPickerOption(name, opt.value, setter)}>
                        <svg class="picker-checkmark" viewBox="0 0 10 10">
                          <path d="M1.5 5.5 3.5 7.5 8.5 2.5" fill="none" stroke="currentColor"
                            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span>${opt.label}</span>
                      </li>`)}`;
    }
    return html`
                  <li class="picker-item ${group.value === value ? 'selected' : ''}"
                    role="option"
                    aria-selected=${group.value === value}
                    @click=${() => this.selectPickerOption(name, group.value, setter)}>
                    <svg class="picker-checkmark" viewBox="0 0 10 10">
                      <path d="M1.5 5.5 3.5 7.5 8.5 2.5" fill="none" stroke="currentColor"
                        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>${group.label}</span>
                  </li>`;
  })}
            </ul>` : nothing}
        </div>
      </div>`;
  }

  renderActionControls() {
    const actionOptions = [
      {
        heading: 'Inherited sites',
        items: [
          { value: 'preview', label: 'Preview' },
          { value: 'publish', label: 'Publish' },
          { value: 'break', label: 'Cancel inheritance' },
        ],
      },
      {
        heading: 'Custom sites',
        items: [
          { value: 'sync', label: 'Sync to satellite' },
          { value: 'reset', label: 'Resume inheritance' },
        ],
      },
    ];

    const syncOptions = [
      { value: 'merge', label: 'Merge' },
      { value: 'override', label: 'Override' },
    ];

    return html`
      <div class="action-row">
        ${this.renderPicker(
'action',
'Action',
this._action,
actionOptions,
(v) => { this._action = v; },
)}
        ${this._action === 'sync' ? this.renderPicker(
'syncMode',
'Sync mode',
this._syncMode,
syncOptions,
(v) => { this._syncMode = v; },
) : nothing}
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

  renderSatelliteStatusIcon() {
    if (!this._satStatus) return nothing;
    if (this._satStatus === STATUS.pending) {
      return html`<svg class="result-icon pending" viewBox="0 0 20 20">
        <use href="/blocks/edit/img/S2_Icon_ClockPending_20_N.svg#S2_Icon_ClockPending"/>
      </svg>`;
    }
    if (this._satStatus === STATUS.success) {
      return html`<svg class="result-icon success" viewBox="0 0 20 20">
        <use href="/blocks/edit/img/S2_Icon_CheckmarkCircle_20_N.svg#S2_Icon_CheckmarkCircle"/>
      </svg>`;
    }
    return html`<svg class="result-icon error" viewBox="0 0 20 20">
      <use href="/blocks/edit/img/S2_Icon_AlertTriangle_20_N.svg#S2_Icon_AlertTriangle"/>
    </svg>`;
  }

  renderSatelliteView() {
    const canResume = this._action === 'resume-inheritance' && !this._hasOverride;

    const satActionOptions = [
      { value: 'sync-from-base', label: 'Sync from Base' },
      { value: 'resume-inheritance', label: 'Resume inheritance' },
    ];

    const syncOptions = [
      { value: 'merge', label: 'Merge' },
      { value: 'override', label: 'Override' },
    ];

    return html`
      <div class="sat-status-line">
        <span class="sat-status-label">Base site:</span>
        <span class="sat-status-value">${this._baseSite}</span>
        ${this.renderSatelliteStatusIcon()}
      </div>
      <div class="action-row">
        ${this.renderPicker(
'action',
'Action',
this._action,
satActionOptions,
(v) => { this._action = v; this._satStatus = undefined; },
)}
        ${this._action === 'sync-from-base' ? this.renderPicker(
'syncMode',
'Sync mode',
this._syncMode,
syncOptions,
(v) => { this._syncMode = v; },
) : nothing}
      </div>
      ${this.renderConfirm()}
      <div class="form-actions">
        <sl-button class="accent"
          @click=${() => this.apply()}
          ?disabled=${this._busy || canResume}>Apply</sl-button>
      </div>`;
  }

  render() {
    if (this._loading) {
      return html`<p class="loading">${this._loading}</p>`;
    }

    if (this._role === 'satellite') {
      return this.renderSatelliteView();
    }

    if (!this._satellites?.length) {
      return html`<p class="no-satellites">No satellite sites configured.</p>`;
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

customElements.define('da-msm', DaMsm);

export default function render(details) {
  const cmp = document.createElement('da-msm');
  cmp.details = details;
  return cmp;
}
