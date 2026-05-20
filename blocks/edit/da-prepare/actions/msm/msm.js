import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import {
  getSiteConfig,
  getSubtreeSatellites,
  isPageLocal,
  checkOverrides,
} from './helpers/config.js';
import {
  previewSatellite,
  publishSatellite,
  createOverride,
  deleteOverride,
  mergeFromBase,
  getSatellitePageStatus,
} from './helpers/utils.js';
import { getNx } from '../../../../../scripts/utils.js';

let nxPath = getNx();
nxPath = nxPath.endsWith('/nx') ? `${nxPath}2` : nxPath;

await import(`${nxPath}/public/se/components.js`);

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

const STATUS = { pending: 'pending', success: 'success', error: 'error' };
const SYNC_MODE = { override: 'override', merge: 'merge' };

const RECURSIVE_ACTIONS = new Set(['preview', 'publish']);
const SYNC_ACTIONS = new Set(['sync', 'sync-from-base']);
const UPWARD_ACTIONS = new Set(['sync-from-base', 'resume-inheritance']);

const ACTION_SCOPE = {
  preview: 'inherited',
  publish: 'inherited',
  break: 'inherited',
  sync: 'custom',
  reset: 'custom',
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
    _asBase: { state: true },
    _asSatellite: { state: true },
    _hasOverride: { state: true },
    _satStatus: { state: true },
    _includeDescendants: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._loading = 'Loading\u2026';
    this._selected = new Set();
    this._action = 'preview';
    this._syncMode = SYNC_MODE.merge;
    this._busy = false;
    this._includeDescendants = false;
    this.loadConfig();
  }

  async loadConfig() {
    const { org, site, path } = this.details;
    this._loading = 'Loading configuration\u2026';

    const config = await getSiteConfig(org, site);

    if (!config) {
      this._satellites = [];
      this._loading = undefined;
      return;
    }

    this._asBase = config.asBase;
    this._asSatellite = config.asSatellite;

    if (this._asSatellite) {
      this._hasOverride = await isPageLocal(org, site, path);
    }

    if (this._asBase) {
      this._loading = 'Checking overrides\u2026';
      const results = await checkOverrides(org, this._asBase.satellites, path);
      this._satellites = results.map((sat) => ({ ...sat, status: undefined }));
    }

    if (!this._asBase && this._asSatellite) {
      this._action = 'sync-from-base';
    }

    this._loading = undefined;
  }

  get _inherited() {
    return this._satellites?.filter((s) => !s.hasOverride) || [];
  }

  get _custom() {
    return this._satellites?.filter((s) => s.hasOverride) || [];
  }

  get _directTargets() {
    const scope = ACTION_SCOPE[this._action];
    const pool = scope === 'custom' ? this._custom : this._inherited;
    return pool.filter((s) => this._selected.has(s.site));
  }

  get _isUpwardMode() {
    return UPWARD_ACTIONS.has(this._action);
  }

  get _isSyncMode() {
    return SYNC_ACTIONS.has(this._action);
  }

  get _isRecursiveActive() {
    return RECURSIVE_ACTIONS.has(this._action);
  }

  get _hasDualRole() {
    return !!(this._asBase && this._asSatellite);
  }

  get _totalDescendants() {
    // Only count descendants of satellites that are in scope for the active
    // action. A custom-overridden satellite with nested children is not
    // reachable from an inherited-scope action (e.g. Roll out to preview), so
    // its descendants must not trigger the cascade UI.
    const scope = ACTION_SCOPE[this._action];
    if (!scope) return 0;
    const pool = scope === 'custom' ? this._custom : this._inherited;
    return pool.reduce((acc, s) => acc + (s.descendantCount || 0), 0);
  }

  async _expandedTargetSites() {
    if (!this._includeDescendants || !RECURSIVE_ACTIONS.has(this._action)) {
      return this._directTargets.map((s) => s.site);
    }
    const { org } = this.details;
    const seen = new Set();
    const ordered = [];
    await Promise.all(this._directTargets.map(async (target) => {
      if (!seen.has(target.site)) {
        seen.add(target.site);
        ordered.push(target.site);
      }
      const subtree = await getSubtreeSatellites(org, target.site);
      subtree.forEach((s) => {
        if (!seen.has(s.site)) {
          seen.add(s.site);
          ordered.push(s.site);
        }
      });
    }));
    return ordered;
  }

  get _canApplyDownward() {
    return !this._busy && this._directTargets.length > 0;
  }

  handleToggle(site) {
    const next = new Set(this._selected);
    if (next.has(site)) next.delete(site);
    else next.add(site);
    this._selected = next;
  }

  clearStatuses() {
    this._satellites = this._satellites?.map((s) => ({ ...s, status: undefined }));
  }

  updateSatStatus(site, status) {
    this._satellites = this._satellites.map(
      (s) => (s.site === site ? { ...s, status } : s),
    );
  }

  onActionChange(value) {
    this._action = value;
    this.clearStatuses();
    this._satStatus = undefined;
  }

  // Direction switch flips the action picker between upward (parent) and
  // downward (children) modes. The picker's options are filtered to match.
  onDirectionToggle(toUpward) {
    this.onActionChange(toUpward ? 'sync-from-base' : 'preview');
  }

  async apply() {
    if (this._isUpwardMode) {
      this.applySatelliteAction();
      return;
    }

    if (!this._canApplyDownward) return;

    if (this._action === 'reset') {
      const names = this._directTargets.map((s) => s.label).join(', ');
      this._confirmAction = { message: `Resume inheritance for ${names}? This deletes local overrides.` };
      return;
    }

    if (this._includeDescendants && RECURSIVE_ACTIONS.has(this._action)) {
      const directLabels = this._directTargets.map((s) => s.label).join(', ');
      const surface = this._action === 'preview' ? 'preview' : 'live';
      this._confirmAction = {
        message: `Roll out ${directLabels} and all their descendants to ${surface}? Inherited content will be served at every site in the subtree.`,
        confirmedAction: this._action,
      };
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
    } else if (confirmedAction === 'preview' || confirmedAction === 'publish') {
      await this.runAction(confirmedAction);
    } else {
      await this.runAction('reset');
    }
  }

  async runAction(action) {
    this._busy = true;
    const { org, site, path } = this.details;

    const directTargets = this._directTargets;
    const expandedSites = await this._expandedTargetSites();
    const recursive = RECURSIVE_ACTIONS.has(action) && this._includeDescendants;

    directTargets.forEach((s) => this.updateSatStatus(s.site, STATUS.pending));

    switch (action) {
      case 'preview':
      case 'publish': {
        const fn = action === 'publish' ? publishSatellite : previewSatellite;
        const results = await Promise.allSettled(
          expandedSites.map((satSite) => fn(org, satSite, path)),
        );
        if (recursive) {
          const allOk = results.every((r) => r.status === 'fulfilled' && !r.value?.error);
          directTargets.forEach((s) => this.updateSatStatus(
            s.site,
            allOk ? STATUS.success : STATUS.error,
          ));
        } else {
          results.forEach((r, idx) => {
            const satSite = expandedSites[idx];
            const ok = r.status === 'fulfilled' && !r.value?.error;
            this.updateSatStatus(satSite, ok ? STATUS.success : STATUS.error);
          });
        }
        break;
      }

      case 'break':
        await Promise.allSettled(directTargets.map(async (sat) => {
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
          await Promise.allSettled(directTargets.map(async (sat) => {
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
          await Promise.allSettled(directTargets.map(async (sat) => {
            const result = await createOverride(org, site, sat.site, path);
            this.updateSatStatus(sat.site, result.error ? STATUS.error : STATUS.success);
          }));
        }
        break;

      case 'reset':
        await Promise.allSettled(directTargets.map(async (sat) => {
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
          }
        }));
        break;

      default:
        break;
    }

    this._selected = new Set();
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
    const baseSite = this._asSatellite?.base;

    try {
      let result;
      if (action === 'sync-from-base') {
        result = this._syncMode === SYNC_MODE.merge
          ? await mergeFromBase(org, baseSite, site, path)
          : await createOverride(org, baseSite, site, path);
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
        this._hasOverride = action !== 'resume-inheritance';
      }
    } catch {
      this._satStatus = STATUS.error;
    }

    this._busy = false;
  }

  /* -------------------------------------------------- *
   * Render
   * -------------------------------------------------- */

  renderStatusIcon(status) {
    if (!status) return nothing;
    if (status === STATUS.pending) {
      return html`<svg class="result-icon pending" viewBox="0 0 20 20">
        <use href="/blocks/edit/img/S2_Icon_ClockPending_20_N.svg#S2_Icon_ClockPending"/>
      </svg>`;
    }
    if (status === STATUS.success) {
      return html`<svg class="result-icon success" viewBox="0 0 20 20">
        <use href="/blocks/edit/img/S2_Icon_CheckmarkCircle_20_N.svg#S2_Icon_CheckmarkCircle"/>
      </svg>`;
    }
    return html`<svg class="result-icon error" viewBox="0 0 20 20">
      <use href="/blocks/edit/img/S2_Icon_AlertTriangle_20_N.svg#S2_Icon_AlertTriangle"/>
    </svg>`;
  }

  renderSatellite(sat) {
    const scope = ACTION_SCOPE[this._action];
    const isBaseAction = scope === 'inherited' || scope === 'custom';
    const outOfScope = isBaseAction && ((scope === 'inherited') === sat.hasOverride);
    const showDescendantBadge = sat.descendantCount > 0;

    return html`
      <li class="sat-row ${outOfScope ? 'out-of-scope' : ''}">
        <label>
          <input type="checkbox"
            .checked=${this._selected.has(sat.site)}
            ?disabled=${this._busy || outOfScope}
            @change=${() => this.handleToggle(sat.site)} />
          <span>${sat.label}</span>
          ${showDescendantBadge ? html`
            <span class="descendant-badge" title="${sat.descendantCount} descendant site${sat.descendantCount === 1 ? '' : 's'}">
              +${sat.descendantCount}
            </span>
          ` : nothing}
        </label>
        ${this.renderStatusIcon(sat.status)}
        ${sat.hasOverride ? html`
          <a class="icon-btn" href=${sat.editUrl || `${window.location.origin}/edit#/${this.details.org}/${sat.site}${this.details.path}`} target="_blank" title="Open in editor">
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

  renderSyncModeSelect() {
    return html`
      <se-select
        label="Sync mode"
        name="syncMode"
        .value=${this._syncMode}
        ?disabled=${this._busy}
        @change=${(e) => { this._syncMode = e.target.value; }}>
        <option value="merge">Merge</option>
        <option value="override">Override</option>
      </se-select>`;
  }

  renderActionPicker() {
    const groups = [];

    // The picker shows only the optgroups relevant to the active direction.
    // The Sync-from-parent switch (or absence of one of the roles) decides
    // which direction is active.
    if (this._asSatellite && this._isUpwardMode) {
      groups.push({
        label: 'From parent',
        items: [
          { value: 'sync-from-base', label: 'Sync from base' },
          { value: 'resume-inheritance', label: 'Resume inheritance' },
        ],
      });
    }

    if (this._asBase && !this._isUpwardMode) {
      groups.push({
        label: 'Inherited sites',
        items: [
          { value: 'preview', label: 'Roll out to preview' },
          { value: 'publish', label: 'Roll out to live' },
          { value: 'break', label: 'Cancel inheritance' },
        ],
      });
      groups.push({
        label: 'Custom sites',
        items: [
          { value: 'sync', label: 'Sync to satellite' },
          { value: 'reset', label: 'Resume inheritance' },
        ],
      });
    }

    return html`
      <se-select
        label="Action"
        name="action"
        .value=${this._action}
        ?disabled=${this._busy}
        @change=${(e) => this.onActionChange(e.target.value)}>
        ${groups.map((group) => html`
          <optgroup label=${group.label}>
            ${group.items.map((opt) => html`
              <option value=${opt.value}>${opt.label}</option>
            `)}
          </optgroup>
        `)}
      </se-select>`;
  }

  renderDirectionSwitch() {
    if (!this._hasDualRole) return nothing;
    return html`
      <label class="direction-switch">
        <input
          type="checkbox"
          role="switch"
          aria-label="Sync from parent"
          .checked=${this._isUpwardMode}
          ?disabled=${this._busy}
          @change=${(e) => this.onDirectionToggle(e.target.checked)} />
        <span>Sync from parent</span>
      </label>`;
  }

  renderBreadcrumb() {
    if (!this._asSatellite) return nothing;

    const chain = [
      ...this._asSatellite.chain,
      { site: this.details.site, label: this.details.site, current: true },
    ];

    return html`
      <div class="crumb-row">
        <span class="crumb-label">Inherits from</span>
        ${chain.map((node, idx) => html`
          ${idx > 0 ? html`<span class="crumb-sep" aria-hidden="true">\u203A</span>` : nothing}
          <span class="crumb-node ${node.current ? 'current' : ''}">${node.label}</span>
        `)}
      </div>`;
  }

  renderUpwardSummary() {
    // Skip for base-only pages or when a downward action is selected.
    if (!this._asSatellite) return nothing;
    if (!this._isUpwardMode) return nothing;

    const baseLabel = this._asSatellite.baseLabel || this._asSatellite.base;
    const targetLabel = this.details.site;
    const overrideText = this._hasOverride ? 'Yes — overridden' : 'None — inherited';
    const overrideMuted = !this._hasOverride;

    return html`
      <section class="upward-summary">
        <div class="row">
          <span class="label">Source</span>
          <span class="value">${baseLabel}</span>
        </div>
        <div class="row">
          <span class="label">Target</span>
          <span class="value">${targetLabel} ${this.renderStatusIcon(this._satStatus)}</span>
        </div>
        <div class="row">
          <span class="label">Local override</span>
          <span class="value ${overrideMuted ? 'muted' : ''}">${overrideText}</span>
        </div>
      </section>`;
  }

  renderChildrenList() {
    // The children list only applies to the downward direction. When the
    // Sync-from-parent switch is on (or the page is satellite-only), hide
    // the list entirely so the dialog focuses on the upward action.
    if (!this._asBase || this._isUpwardMode) return nothing;
    const inherited = this._inherited;
    const custom = this._custom;
    if (!inherited.length && !custom.length) return nothing;

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

  renderFooter() {
    const showCascade = this._isRecursiveActive
      && this._totalDescendants > 0
      && !this._isUpwardMode;
    // "Resume inheritance" on a satellite is a no-op if there's no local
    // override to remove; disable Apply in that case.
    const noOverrideToResume = this._action === 'resume-inheritance'
      && this._asSatellite && !this._hasOverride;
    const applyDisabled = this._busy
      || (this._isUpwardMode ? noOverrideToResume : !this._canApplyDownward);

    return html`
      <div class="form-actions">
        ${showCascade ? html`
          <label class="footer-cascade">
            <input type="checkbox"
              .checked=${this._includeDescendants}
              ?disabled=${this._busy}
              @change=${(e) => { this._includeDescendants = e.target.checked; }} />
            <span>Cascade to nested sites (+${this._totalDescendants} more)</span>
          </label>` : nothing}
        <sl-button class="accent"
          @click=${() => this.apply()}
          ?disabled=${applyDisabled}>Apply</sl-button>
      </div>`;
  }

  render() {
    if (this._loading) {
      return html`<p class="loading">${this._loading}</p>`;
    }

    if (!this._asBase && !this._asSatellite) {
      return html`<p class="no-satellites">No satellite sites configured.</p>`;
    }

    return html`
      ${this.renderBreadcrumb()}
      ${this.renderDirectionSwitch()}
      <div class="action-row">
        ${this.renderActionPicker()}
        ${this._isSyncMode ? this.renderSyncModeSelect() : nothing}
      </div>
      ${this.renderUpwardSummary()}
      ${this.renderChildrenList()}
      ${this.renderFooter()}
      ${this.renderConfirm()}`;
  }
}

customElements.define('da-msm', DaMsm);

export default function render(details) {
  const cmp = document.createElement('da-msm');
  cmp.details = details;
  return cmp;
}
