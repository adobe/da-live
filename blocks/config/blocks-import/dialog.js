import { LitElement, html, nothing } from 'da-lit';
import { getNx2Api } from '../../../scripts/utils.js';
import { saveSource } from '../api.js';
import { firstSheetName, getRows, setRows } from '../sheets.js';
import { renderField } from '../editors/fields.js';
import { parseRepo, createGitHub, analyzeBlock } from './github.js';
import { findBlocks, blockExamples, blockDoc, displayName, mergeBlockRows } from './blocks.js';
import { IMPORT } from '../messages.js';

// Block docs live next to the list: /library/blocks.json → /library/blocks/<name>.html
export const docFolder = (listPath) => listPath.replace(/\.json$/, '/');

export const parsePages = (text) => [...new Set((text ?? '').split(/[\n,]/)
  .map((p) => p.trim()).filter(Boolean))];

// Reads pages of the site from DA: Map<page, html>. Unreadable pages are skipped.
export async function readPages(org, site, pages, onProgress = () => {}) {
  const { source, asText } = await getNx2Api();
  const htmls = new Map();
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    onProgress(IMPORT.reading(page, i + 1, pages.length));
    const path = page.endsWith('.html') ? page : `${page}.html`;
    // Sequential on purpose: keeps DA load and progress readable.
    // eslint-disable-next-line no-await-in-loop
    const result = await asText(source.get({ org, site, path })).catch(() => ({}));
    if (result.ok) htmls.set(page, result.data);
  }
  return htmls;
}

// Creates a doc per block (from page examples, else from the GitHub code), then adds the blocks
// to the list. Resolves to { imported: [names], failed: [names], listStatus }.
export async function runImport({
  org, site, listPath, blocks, htmls = new Map(), github = null, onProgress = () => {},
}) {
  const { source } = await getNx2Api();
  const folder = docFolder(listPath);
  const rows = [];
  const failed = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    onProgress(IMPORT.creating(block.name, i + 1, blocks.length));
    const examples = [...htmls.values()].flatMap((page) => blockExamples(page, block.name));
    /* eslint-disable no-await-in-loop */
    const analysis = !examples.length && github && block.path
      ? await analyzeBlock(github, block).catch(() => null) : null;
    const body = blockDoc(block.name, { examples, analysis });
    const resp = await source.save({ org, site, path: `${folder}${block.name}.html`, body })
      .catch(() => null);
    /* eslint-enable no-await-in-loop */
    if (resp?.ok) {
      rows.push({ name: displayName(block.name), path: `https://content.da.live/${org}/${site}${folder}${block.name}` });
    } else {
      failed.push(block.name);
    }
  }
  if (!rows.length) return { imported: [], failed, listStatus: null };

  onProgress(IMPORT.updatingList);
  const result = await saveSource(org, site, listPath, (json) => {
    const sheet = firstSheetName(json);
    return setRows(json, mergeBlockRows(getRows(json, sheet), rows), sheet);
  });
  const listStatus = result.ok ? null : result.status;
  return { imported: rows.map((r) => r.name), failed, listStatus };
}

const FIELDS = {
  repo: { key: 'repo', label: 'Repository', hint: 'Blocks are the folders inside blocks/.', placeholder: 'https://github.com/org/repo' },
  branch: { key: 'branch', label: 'Branch', hint: 'Branch to read.', placeholder: 'main' },
  token: { key: 'token', label: 'Token', hint: 'Only for private repositories. Kept in this page only, never saved.', type: 'password' },
  pages: { key: 'pages', label: 'Pages', hint: 'Pages of this site that use the blocks, one per line. Their blocks become the examples.', placeholder: '/index', multiline: true },
  samples: { key: 'samples', label: 'Example pages', hint: 'Optional pages of this site to copy real block content from. Blocks without one get a placeholder built from their code.', placeholder: '/index', multiline: true },
};

// The import dialog: source (GitHub repo or pages) → pick blocks → import → summary.
// Rendered into <da-config>'s shadow root so it shares its style-guide styles.
class DaConfigBlocksImport extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    listPath: { attribute: false },
    existing: { attribute: false },
    _step: { state: true },
    _mode: { state: true },
    _form: { state: true },
    _blocks: { state: true },
    _selected: { state: true },
    _error: { state: true },
    _progress: { state: true },
    _result: { state: true },
  };

  constructor() {
    super();
    this.existing = [];
    this._step = 'source';
    this._mode = 'github';
    this._form = { repo: '', branch: 'main', token: '', pages: '', samples: '' };
    this._blocks = [];
    this._selected = new Set();
    this._error = null;
    this._progress = '';
    this._result = null;
    this._github = null;
    this._htmls = new Map();
  }

  createRenderRoot() { return this; }

  _set(key, value) {
    this._form = { ...this._form, [key]: value };
  }

  _emit(name) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  async _find() {
    this._error = null;
    this._progress = IMPORT.looking;
    this._step = 'busy';
    try {
      if (this._mode === 'github') await this._findInGitHub();
      else await this._findInPages();
    } catch (e) {
      this._error = e.message;
    }
    this._step = this._error || !this._blocks.length ? 'source' : 'select';
    this._selected = new Set(this._blocks.map((b) => b.name));
  }

  async _findInGitHub() {
    const repo = parseRepo(this._form.repo);
    if (!repo) throw new Error(IMPORT.repo);
    const { branch, token } = this._form;
    this._github = createGitHub({ ...repo, branch: branch.trim() || 'main', token: token.trim() });
    const access = await this._github.checkAccess();
    if (access) throw new Error(IMPORT.access[access]);
    const found = await this._github.discoverBlocks();
    if (!found.length) throw new Error(IMPORT.noFolders);
    this._blocks = found.map((b) => ({ ...b, variants: [] }));
  }

  async _findInPages() {
    const pages = parsePages(this._form.pages);
    if (!pages.length || pages.some((p) => !p.startsWith('/'))) {
      throw new Error(IMPORT.pages);
    }
    this._github = null;
    this._htmls = await readPages(this.org, this.site, pages, (p) => { this._progress = p; });
    if (!this._htmls.size) throw new Error(IMPORT.noPages);
    const found = [...this._htmls.values()].reduce((map, page) => findBlocks(page, map), new Map());
    if (!found.size) throw new Error(IMPORT.noBlocks);
    this._blocks = [...found].map(([name, variants]) => ({ name, variants: [...variants] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _toggle(name, on) {
    const next = new Set(this._selected);
    if (on) next.add(name);
    else next.delete(name);
    this._selected = next;
  }

  async _import() {
    this._error = null;
    this._step = 'busy';
    const onProgress = (p) => { this._progress = p; };
    if (this._mode === 'github') {
      const samples = parsePages(this._form.samples).filter((p) => p.startsWith('/'));
      this._htmls = await readPages(this.org, this.site, samples, onProgress);
    }
    this._result = await runImport({
      org: this.org,
      site: this.site,
      listPath: this.listPath,
      blocks: this._blocks.filter((b) => this._selected.has(b.name)),
      htmls: this._htmls,
      github: this._github,
      onProgress,
    });
    this._step = 'done';
  }

  _field(field, autofocus = false) {
    const raw = this._form[field.key];
    const onChange = (key, value) => this._set(key, value);
    return renderField({ field, raw, value: raw.trim() }, { onChange }, { autofocus });
  }

  _renderSource() {
    const modes = [{ value: 'github', label: 'GitHub repository' }, { value: 'pages', label: 'Pages' }];
    return html`
      <nx-segmented-btn label="Find blocks in" .items=${modes} .value=${this._mode}
        @change=${(e) => { this._mode = e.detail.value; this._error = null; }}></nx-segmented-btn>
      ${this._mode === 'github' ? html`
        ${this._field(FIELDS.repo, true)}${this._field(FIELDS.branch)}${this._field(FIELDS.token)}`
    : this._field(FIELDS.pages, true)}`;
  }

  _renderSelect() {
    const existing = new Set(this.existing.map((n) => n.toLowerCase()));
    return html`
      <p class="config-message">${this._selected.size} of ${this._blocks.length} selected.
        <button type="button" class="nx-action-btn-quiet nx-btn-sm"
          @click=${() => { this._selected = new Set(this._blocks.map((b) => b.name)); }}>All</button>
        <button type="button" class="nx-action-btn-quiet nx-btn-sm"
          @click=${() => { this._selected = new Set(); }}>None</button>
      </p>
      <ul class="config-import-list">
        ${this._blocks.map((b) => html`
          <li>
            <label class="nx-checkbox">
              <input type="checkbox" .checked=${this._selected.has(b.name)}
                @change=${(e) => this._toggle(b.name, e.target.checked)}>
              ${b.name}${b.variants.length ? html` <span class="config-setting-hint">(${b.variants.join(', ')})</span>` : nothing}
              ${existing.has(displayName(b.name).toLowerCase()) ? html` <span class="config-setting-hint">· updates the list entry</span>` : nothing}
            </label>
          </li>`)}
      </ul>
      ${this._mode === 'github' ? this._field(FIELDS.samples) : nothing}`;
  }

  // `listStatus` is null when the list was updated or nothing was created; 0 is a network error.
  _renderDone() {
    const { imported, failed, listStatus } = this._result;
    const listFailed = listStatus !== null;
    const folder = docFolder(this.listPath);
    const created = IMPORT.created(imported.length, folder, listFailed ? null : this.listPath);
    const message = (content) => html`<p class="config-message">${content}</p>`;
    return html`
      ${imported.length ? message(created) : nothing}
      ${failed.length ? message(IMPORT.createFailed(failed)) : nothing}
      ${listFailed ? message(IMPORT.listFailed({ status: listStatus })) : nothing}`;
  }

  _renderBody() {
    if (this._step === 'busy') {
      return html`<div class="config-loading" role="status">
        <span class="nx-loading-spinner" aria-hidden="true"></span><span>${this._progress}</span></div>`;
    }
    if (this._step === 'select') return this._renderSelect();
    if (this._step === 'done') return this._renderDone();
    return this._renderSource();
  }

  _renderActions() {
    const btn = (cls, label, onClick, disabled = false) => html`<button type="button" slot="actions"
      class=${cls} ?disabled=${disabled} @click=${onClick}>${label}</button>`;
    if (this._step === 'busy') return btn('nx-form-btn-secondary', 'Cancel', () => {}, true);
    if (this._step === 'done') return btn('nx-form-btn-primary', 'Done', () => this._emit('import-done'));
    if (this._step === 'select') {
      return html`
        ${btn('nx-form-btn-secondary', 'Back', () => { this._step = 'source'; })}
        ${btn('nx-form-btn-primary', `Import ${this._selected.size}`, () => this._import(), !this._selected.size)}`;
    }
    return html`
      ${btn('nx-form-btn-secondary', 'Cancel', () => this._emit('import-close'))}
      ${btn('nx-form-btn-primary', 'Find blocks', () => this._find())}`;
  }

  render() {
    return html`
      <nx-dialog class="config-row-dialog" title="Import blocks"
        @close=${() => (this._step === 'done' ? this._emit('import-done') : this._emit('import-close'))}>
        <div class="config-row-form">
          ${this._renderBody()}
          ${this._error ? html`<p class="nx-input-error-msg" role="alert">${this._error}</p>` : nothing}
        </div>
        ${this._renderActions()}
      </nx-dialog>`;
  }
}

if (!customElements.get('da-config-blocks-import')) {
  customElements.define('da-config-blocks-import', DaConfigBlocksImport);
}
