import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { loadBlockOptions } from '../ew-panel-extensions/helpers.js';
import { processBlockOptions } from '../ew-editor-doc/slash-menu/block-options.js';
import { setSectionMetadata, getSectionMetadata, getSectionName, normalizeForSlashMenu } from '../editor-utils/blocks.js';
import { isColorCode } from '../editor-utils/color-code.js';
import { canvasBus } from '../utils/canvas-bus.js';

const nx = getNx();
const { loadStyle } = await import(`${nx}/utils/utils.js`);
await import(`${nx}/blocks/shared/picker/picker.js`);

const [toolbarStyles, styles] = await Promise.all([
  loadStyle(new URL('../ew-block-toolbar/ew-block-toolbar.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

class EwSectionToolbar extends LitElement {
  static properties = {
    view: { attribute: false },
    org: { type: String },
    site: { type: String },
    sectionIndex: { attribute: false },
    _options: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [toolbarStyles, styles];
    const refresh = () => { if (this.open) this.requestUpdate(); };
    this._unsubscribeDocState = canvasBus.editorDocState.subscribe(refresh);
    this._unsubscribeHtml = canvasBus.editorHtmlState.subscribe(refresh);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeDocState?.();
    this._unsubscribeHtml?.();
  }

  updated(changed) {
    if (changed.has('org') || changed.has('site')) this._loadOptions();
  }

  async _loadOptions() {
    const { org, site } = this;
    this._options = null;
    if (!org || !site) return;
    try {
      const data = await loadBlockOptions(org, site);
      if (this.org !== org || this.site !== site) return;
      this._options = processBlockOptions(data).get('section-metadata') ?? null;
    } catch {
      this._options = null;
    }
  }

  show(sectionIndex) {
    const main = document.querySelector('main');
    if (main) {
      const { left, width } = main.getBoundingClientRect();
      this.style.setProperty('--toolbar-anchor-x', `${left + width / 2}px`);
    }
    this.sectionIndex = sectionIndex;
    this.classList.add('open');
  }

  hide() {
    this.classList.remove('open');
  }

  get open() {
    return this.classList.contains('open');
  }

  _onChange(key, e) {
    if (!this.view || this.sectionIndex == null) return;
    setSectionMetadata(this.view, this.sectionIndex, key, e.detail.value);
    canvasBus.metadataRerenderRequest.emit();
  }

  _renderField(key, values, current) {
    const items = [
      { section: key },
      { value: '', label: 'None' },
      ...values.map((v) => ({
        value: v.value,
        label: v.title,
        ...(isColorCode(v.value) ? { swatch: v.value } : {}),
      })),
    ];
    return html`
      <span class="toolbar-sep" aria-hidden="true"></span>
      <label class="toolbar-field">
        <span class="toolbar-field-label">${key}</span>
        <nx-picker
          class="toolbar-variant"
          placement="above"
          ignoreFocus
          .items=${items}
          .value=${current[normalizeForSlashMenu(key)] ?? ''}
          @change=${(e) => this._onChange(key, e)}
        ></nx-picker>
      </label>`;
  }

  render() {
    if (this.sectionIndex == null) return nothing;
    const current = getSectionMetadata(this.view, this.sectionIndex);
    return html`
      <div class="toolbar-wrap" @mousedown=${(e) => e.preventDefault()}>
        <span class="section-name">${getSectionName(this.view, this.sectionIndex) || `Section ${this.sectionIndex + 1}`}</span>
        ${this._options
    ? [...this._options].map(([key, values]) => this._renderField(key, values, current))
    : nothing}
      </div>`;
  }
}

customElements.define('ew-section-toolbar', EwSectionToolbar);

export default EwSectionToolbar;
