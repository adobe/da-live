// <da-config>: edits org and site configuration one section at a time. The sections, where they
// show and where they're stored come from sections.js; this element owns the state (route, loaded
// data, unsaved work) and wires model.js (derived state) to views.js and the editors.

import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import {
  ORG, SITE, tabsForScope, resolveSelection, tabFromUrl, urlWithTab, rememberSection,
  rememberedSection,
} from '../sections.js';
import { inFile, readFile, save } from '../stores.js';
import { loadConfigs, listSites, setupLibrary, isDenied } from '../api.js';
import { siteNames } from '../../permissions/utils.js';
import { renderSettings } from '../editors/settings.js';
import { renderFileStatus, renderLibraryStatus } from '../editors/file-status.js';
import { cleanRow, rowErrors, renderRows, renderRowDialog } from '../editors/rows.js';
import {
  editorContext, editState, mutationFor, needsSetup, inheritanceText, panelKey,
} from './model.js';
import {
  renderOrgForm, renderHeader, renderLoadStatus, renderTabs, renderIntro, renderSetup,
  renderParts, renderSaveBar, renderConfirm, renderImportButton, renderImportDialog,
} from './views.js';
import { SHELL } from '../messages.js';

await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import(`${getNx()}/blocks/shared/segmented-btn/segmented.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
await import(`${getNx()}/blocks/shared/pills/pills.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, spinner, style, tabStyle] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  getSheet(`${getNx2()}/styles/spinner.css`),
  loadStyle(import.meta.url),
  getSheet(new URL('./tabs.css', import.meta.url).href),
]);

async function toast(text, variant) {
  const { showToast } = await import(`${getNx2()}/blocks/shared/toast/toast.js`);
  showToast({ text, variant });
}

class DaConfig extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    _status: { state: true },
    _httpStatus: { state: true },
    _configs: { state: true },
    _sites: { state: true },
    _sectionId: { state: true },
    _partId: { state: true },
    _file: { state: true },
    _edits: { state: true },
    _rows: { state: true },
    _draft: { state: true },
    _importing: { state: true },
    _busy: { state: true },
    _readOnly: { state: true },
    _confirm: { state: true },
  };

  constructor() {
    super();
    this.org = null;
    this.site = null;
    this._status = null;
    this._httpStatus = null;
    this._configs = { org: null, site: null };
    this._sites = [];
    this._sectionId = tabFromUrl(window.location.href);
    this._partId = null;
    this._file = null;
    this._resetScope();
    this._onBeforeUnload = (e) => {
      if (this._edit?.dirty) e.preventDefault();
    };
    // The setup app opens in another tab; re-check when the user comes back.
    this._onFocus = () => {
      if (this._status === 'ok' && this._needsSetup) this._load();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, buttons, spinner, style];
    window.addEventListener('beforeunload', this._onBeforeUnload);
    window.addEventListener('focus', this._onFocus);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('beforeunload', this._onBeforeUnload);
    window.removeEventListener('focus', this._onFocus);
  }

  willUpdate(changed) {
    const orgChanged = changed.has('org') && this.org !== changed.get('org');
    const siteChanged = changed.has('site') && this.site !== changed.get('site');
    if (orgChanged) this._loadSites();
    // Edits belong to one scope; the scope picker already confirmed before navigating.
    if (orgChanged || siteChanged) {
      this._resetScope();
      this._load();
      // Without `?tab=`, open the section last shown for this org/site.
      this._sectionId ??= rememberedSection(this.org, this.site);
    }
    // File-stored sections are read once the configs are in (a library's path is in the config).
    const fileKey = this._fileKey;
    if (fileKey !== this._fileFor) {
      this._fileFor = fileKey;
      this._file = null;
      if (fileKey) this._loadFile(fileKey);
    }
  }

  updated() {
    // nx-segmented-btn has no styling hooks, so add the tab design to its shadow root.
    this.shadowRoot.querySelectorAll('nx-segmented-btn').forEach(({ shadowRoot: root }) => {
      if (root && !root.adoptedStyleSheets.includes(tabStyle)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, tabStyle];
      }
    });
    // Keep `?tab=` and the remembered section in sync with the section shown.
    const { tab, section } = this._selection;
    if (this._status !== 'ok' || !section) return;
    if (tabFromUrl(window.location.href) !== section.id) {
      window.history.replaceState(null, '', urlWithTab(window.location.href, section.id));
    }
    rememberSection(this.org, this.site, tab.id, section.id);
  }

  async _load() {
    const { org, site } = this;
    if (!org) {
      this._status = null;
      this._configs = { org: null, site: null };
      return;
    }
    this._status = 'loading';
    const result = await loadConfigs(org, site);
    // The route changed while this load was in flight.
    if (this.org !== org || this.site !== site) return;
    this._status = result.status;
    this._httpStatus = result.httpStatus ?? null;
    this._configs = { org: result.org, site: result.site };
  }

  async _loadSites() {
    const { org } = this;
    this._sites = [];
    if (!org) return;
    const sites = await listSites(org);
    if (this.org === org) this._sites = sites;
  }

  get _fileKey() {
    const { section } = this._selection;
    if (this._status !== 'ok' || !section || !inFile(section.store)) return null;
    return `${this.org}/${this.site}/${section.id}`;
  }

  async _loadFile(key) {
    const { org, site } = this;
    const { store } = this._selection.section;
    this._file = { status: 'loading' };
    const file = await readFile(store, { org, site, siteConfig: this._configs.site });
    if (this._fileFor === key) this._file = file;
  }

  get _atSite() {
    return !!this.site;
  }

  get _tabs() {
    return tabsForScope(this._atSite ? SITE : ORG);
  }

  get _selection() {
    return resolveSelection(this._tabs, this._sectionId);
  }

  get _ctx() {
    return editorContext({
      section: this._selection.section,
      partId: this._partId,
      atSite: this._atSite,
      configs: this._configs,
      file: this._file,
    });
  }

  // Unsaved work in the current panel, or null before the configs are in.
  get _edit() {
    if (this._status !== 'ok') return null;
    return editState(this._ctx, { edits: this._edits, rows: this._rows });
  }

  get _needsSetup() {
    return needsSetup(this._ctx, { configs: this._configs, atSite: this._atSite });
  }

  get _setupUrl() {
    return this._ctx.panel.setup?.url(this.org, this.site);
  }

  // Editing is off while saving and after the server denied a save.
  get _locked() {
    return this._readOnly || this._busy;
  }

  // Like da-permissions: listed sites plus any site the org's permissions rules mention,
  // since the listing can come back empty (e.g. stage DA).
  get _siteNames() {
    return siteNames(this._sites, this._configs.org?.permissions?.data ?? []);
  }

  _resetScope() {
    this._clearEdits();
    this._confirm = null;
    this._importing = false;
    this._readOnly = false;
    this._busy = false;
  }

  _clearEdits() {
    this._edits = {};
    this._rows = null;
    this._draft = null;
  }

  // Runs `action` now, or after the user agrees to drop unsaved edits. `revert` puts the
  // control that triggered it back, since nx components update themselves on click.
  _guard(action, revert) {
    if (!this._edit?.dirty) {
      this._clearEdits();
      action();
      return;
    }
    this._confirm = { action, revert };
  }

  _resolveConfirm(proceed) {
    const { action, revert } = this._confirm;
    this._confirm = null;
    if (!proceed) {
      revert();
      return;
    }
    this._clearEdits();
    action();
  }

  _onOrgSubmit(e) {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get('org')?.toString().trim();
    if (value) window.location.hash = `/${value}`;
  }

  _onScopeChange({ detail, target }) {
    this._guard(() => {
      window.location.hash = detail.value ? `/${this.org}/${detail.value}` : `/${this.org}`;
    }, () => { target.value = this.site ?? ''; });
  }

  _showSection(sectionId, target, current) {
    this._guard(() => {
      this._sectionId = sectionId;
      this._partId = null;
    }, () => { target.value = current; });
  }

  // A tab opens on the section last shown in it.
  _onPrimaryChange({ detail, target }) {
    const tab = this._tabs.find((t) => t.id === detail.value);
    const remembered = rememberedSection(this.org, this.site, tab.id);
    const id = tab.sections.some((s) => s.id === remembered) ? remembered : tab.sections[0].id;
    this._showSection(id, target, this._selection.tab.id);
  }

  _onSectionChange({ detail, target }) {
    this._showSection(detail.value, target, this._selection.section.id);
  }

  _onPartChange({ detail, target }) {
    const current = this._ctx.part.id;
    this._guard(
      () => { this._partId = detail.value; },
      () => { target.value = current; },
    );
  }

  _onEdit(key, value) {
    this._edits = { ...this._edits, [key]: value };
  }

  _onRowAdd(row = {}) {
    this._draft = { index: null, row: { ...row } };
  }

  _onRowEdit(index) {
    this._draft = { index, row: { ...this._edit.list.rows[index] } };
  }

  _onRowRemove(index) {
    this._rows = this._edit.list.rows.filter((_, i) => i !== index);
  }

  _onDraftChange(key, value) {
    this._draft = { ...this._draft, row: { ...this._draft.row, [key]: value } };
  }

  // Applies the dialog to the pending rows, or keeps it open and shows errors.
  _onDraftApply() {
    const { rows } = this._edit.list;
    const draft = { ...this._draft, row: cleanRow(this._draft.row) };
    if (Object.keys(rowErrors(this._ctx.panel, rows, draft)).length) {
      this._draft = { ...this._draft, submitted: true };
      return;
    }
    this._rows = draft.index === null
      ? [...rows, draft.row]
      : rows.map((row, i) => (i === draft.index ? draft.row : row));
    this._draft = null;
  }

  async _onImportOpen() {
    await import('../blocks-import/dialog.js');
    this._importing = true;
  }

  // The import wrote docs and the list itself; read the list again.
  _onImportDone() {
    this._importing = false;
    this._fileFor = null;
    this.requestUpdate();
  }

  // Runs a write with editing locked. Resolves to the result when it succeeded for the route it
  // started on; a denied write switches to read-only, any other failure shows `failed(result)`.
  async _write(write, failed) {
    const { org, site } = this;
    this._busy = true;
    const result = await write(org, site);
    // The route changed meanwhile; that scope's state is already gone.
    if (this.org !== org || this.site !== site) return null;
    this._busy = false;
    if (result.ok) return result;
    if (isDenied(result)) this._readOnly = true;
    else toast(failed(result), 'error');
    return null;
  }

  async _onSetupLibrary() {
    const { store } = this._ctx;
    const setup = (org, site) => setupLibrary(org, site, store);
    const done = await this._write(setup, SHELL.setupLibraryFailed);
    if (done) this._load();
  }

  // The result belongs to the file and panel it was started from: if the user moved on while it
  // was saving, the file shown now and its edits are left alone.
  async _save() {
    const ctx = this._ctx;
    const fileKey = this._fileFor;
    const startedOn = panelKey(ctx);
    const mutate = mutationFor(ctx, this._edit);
    const result = await this._write(
      (org, site) => save(ctx.store, { org, site, path: this._file?.path }, mutate),
      SHELL.saveFailed,
    );
    if (!result) return;
    if (!inFile(ctx.store)) {
      this._configs = { ...this._configs, [this._atSite ? SITE : ORG]: result.config };
    } else if (this._fileFor === fileKey) {
      this._file = { ...this._file, json: result.config, missing: false };
    }
    if (panelKey(this._ctx) === startedOn) this._clearEdits();
    toast(SHELL.saved, 'success');
  }

  _renderFileStatus({ store }) {
    const opts = {
      org: this.org,
      site: this.site,
      locked: this._locked,
      onSetup: () => this._onSetupLibrary(),
    };
    return store.type === 'library'
      ? renderLibraryStatus(store, this._file, opts)
      : renderFileStatus(this._file, opts);
  }

  _renderSettings({ panel }, edit) {
    if (this._needsSetup) {
      const onCheck = () => this._load();
      return renderSetup(panel.setup, { setupUrl: this._setupUrl, onCheck });
    }
    return renderSettings(edit.states, {
      disabled: this._locked,
      onChange: (key, value) => this._onEdit(key, value),
      onReset: (key) => this._onEdit(key, ''),
    });
  }

  _renderImport(list) {
    if (!this._importing) return nothing;
    return renderImportDialog({
      org: this.org,
      site: this.site,
      listPath: this._file.path,
      existing: list.rows.map((row) => row.name ?? ''),
      onClose: () => { this._importing = false; },
      onDone: () => this._onImportDone(),
    });
  }

  _renderDraft(panel, list) {
    if (!this._draft) return nothing;
    const errors = rowErrors(panel, list.rows, this._draft);
    return renderRowDialog(panel, this._draft, errors, {
      onChange: (key, value) => this._onDraftChange(key, value),
      onApply: () => this._onDraftApply(),
      onCancel: () => { this._draft = null; },
    });
  }

  _renderRows({ panel }, { list }) {
    const onImport = () => this._onImportOpen();
    const handlers = {
      disabled: this._locked,
      // The file status already says the list is empty.
      empty: this._file?.missing ? nothing : undefined,
      actions: panel.importable ? renderImportButton(list.dirty, onImport) : nothing,
      onAdd: () => this._onRowAdd(),
      onEdit: (index) => this._onRowEdit(index),
      onRemove: (index) => this._onRowRemove(index),
      onOverride: (row) => this._onRowAdd(row),
    };
    return html`
      ${renderRows(panel, list, handlers)}
      ${this._renderImport(list)}
      ${this._renderDraft(panel, list)}`;
  }

  _renderIntro(ctx) {
    if (this._needsSetup) return nothing;
    return renderIntro(ctx.panel, {
      docs: ctx.section.docs,
      inheritance: inheritanceText(ctx, this._atSite),
      setupUrl: this._atSite ? this._setupUrl : null,
      readOnly: this._readOnly,
    });
  }

  _renderParts({ section, part }) {
    const { parts } = section.panel;
    if (!parts) return nothing;
    return renderParts(parts, part, (e) => this._onPartChange(e));
  }

  _renderEditor(ctx, edit) {
    if (!ctx.ready) return nothing;
    return ctx.panel.kind === 'rows' ? this._renderRows(ctx, edit) : this._renderSettings(ctx, edit);
  }

  _renderPanel() {
    const ctx = this._ctx;
    const edit = this._edit;
    const saveBar = {
      busy: this._busy,
      onDiscard: () => this._clearEdits(),
      onSave: () => this._save(),
    };
    return html`
      <section class="config-panel" aria-label=${ctx.section.label}>
        <h3 class="config-panel-title">${ctx.section.label}</h3>
        ${this._renderIntro(ctx)}
        ${this._renderParts(ctx)}
        ${inFile(ctx.store) ? this._renderFileStatus(ctx) : nothing}
        ${this._renderEditor(ctx, edit)}
        ${renderSaveBar(edit, saveBar)}
      </section>`;
  }

  _renderBody() {
    if (this._status !== 'ok') {
      const scope = this._atSite ? `${this.org}/${this.site}` : this.org;
      return renderLoadStatus({ status: this._status, httpStatus: this._httpStatus, scope });
    }
    const selection = this._selection;
    const tabHandlers = {
      onPrimaryChange: (e) => this._onPrimaryChange(e),
      onSectionChange: (e) => this._onSectionChange(e),
    };
    const onConfirm = (proceed) => this._resolveConfirm(proceed);
    return html`
      ${renderTabs(this._tabs, selection, tabHandlers)}
      ${this._renderPanel()}
      ${this._confirm ? renderConfirm(selection.section.label, onConfirm) : nothing}`;
  }

  render() {
    if (!this.org) {
      return html`
        <div class="config-shell">
          <h2 class="config-title">Config</h2>
          ${renderOrgForm((e) => this._onOrgSubmit(e))}
        </div>`;
    }
    const header = {
      siteNames: this._siteNames,
      site: this.site,
      onScopeChange: (e) => this._onScopeChange(e),
    };
    return html`
      <div class="config-shell">
        ${renderHeader(header)}
        ${this._renderBody()}
      </div>`;
  }
}

if (!customElements.get('da-config')) {
  customElements.define('da-config', DaConfig);
}
