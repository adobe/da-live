import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { loadBlockOptions } from '../ew-panel-extensions/helpers.js';
import { buildMetadataFields, splitMultiValue, joinMultiValue } from '../editor-utils/metadata-fields.js';
import { setSectionMetadata, getSectionMetadata, getSectionName, normalizeForSlashMenu } from '../editor-utils/blocks.js';
import { canvasBus } from '../utils/canvas-bus.js';

const nx = getNx();
const { loadStyle } = await import(`${nx}/utils/utils.js`);
await import(`${nx}/blocks/shared/picker/picker.js`);

const [toolbarStyles, styles] = await Promise.all([
  loadStyle(new URL('../ew-block-toolbar/ew-block-toolbar.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

export function sectionMetadataFields(data) {
  return buildMetadataFields(data, 'section-metadata')
    .filter((field) => field.values && field.type !== 'json');
}

class EwSectionToolbar extends LitElement {
  static properties = {
    view: { attribute: false },
    org: { type: String },
    site: { type: String },
    sectionIndex: { attribute: false },
    _fields: { state: true },
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
    this._fields = [];
    if (!org || !site) return;
    try {
      const data = await loadBlockOptions(org, site);
      if (this.org !== org || this.site !== site) return;
      this._fields = sectionMetadataFields(data);
    } catch {
      this._fields = [];
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

  _write(key, value) {
    if (!this.view || this.sectionIndex == null) return;
    setSectionMetadata(this.view, this.sectionIndex, key, value);
    canvasBus.metadataRerenderRequest.emit();
  }

  _renderField(field, current) {
    const multiple = field.type === 'multi';
    const value = current[normalizeForSlashMenu(field.key)] ?? '';
    const items = [
      { section: field.label },
      ...(multiple ? [] : [{ value: '', label: 'None' }]),
      ...field.values.map((v) => ({
        value: v.value,
        label: v.title,
        ...(v.colorValue ? { swatch: v.colorValue } : {}),
      })),
    ];
    const onChange = multiple
      ? (e) => this._write(field.key, joinMultiValue(e.detail.values, field.values))
      : (e) => this._write(field.key, e.detail.value);
    return html`
      <span class="toolbar-sep" aria-hidden="true"></span>
      <label class="toolbar-field">
        <span class="toolbar-field-label">${field.label}</span>
        <nx-picker
          class="toolbar-variant"
          placement="above"
          ignoreFocus
          .multiple=${multiple}
          placeholder="None"
          .items=${items}
          .value=${value}
          .values=${splitMultiValue(value)}
          @change=${onChange}
        ></nx-picker>
      </label>`;
  }

  render() {
    if (this.sectionIndex == null) return nothing;
    const current = getSectionMetadata(this.view, this.sectionIndex);
    return html`
      <div class="toolbar-wrap" @mousedown=${(e) => e.preventDefault()}>
        <span class="section-name">${getSectionName(this.view, this.sectionIndex) || `Section ${this.sectionIndex + 1}`}</span>
        ${(this._fields ?? []).map((field) => this._renderField(field, current))}
      </div>`;
  }
}

customElements.define('ew-section-toolbar', EwSectionToolbar);

export default EwSectionToolbar;
