import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/form/sl-textarea-extended.js';
import './components/form/sl-input-extended.js';
import './components/form/sl-select-extended.js';
import './components/form/sl-checkbox.js';
import './components/form/form-item-group.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

class FormEditor extends LitElement {
  static properties = {
    formModel: { state: true },
    _data: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._handleActivateItemGroup = (e) => {
      const { pointer, source } = e?.detail || {};
      if (!pointer || source === 'editor') return;
      const target = this.shadowRoot.querySelector(`.item-group[data-key="${pointer}"]`);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    window.addEventListener('activate-item-group', this._handleActivateItemGroup);
  }

  disconnectedCallback() {
    window.removeEventListener('activate-item-group', this._handleActivateItemGroup);
    super.disconnectedCallback();
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      console.debug('[da-form-editor] formModel changed, regenerating annotated data');
      this.getData();
    }
    super.update(props);
  }

  getData() {
    this._data = this.formModel.annotated;
  }

  emitReplace(pointer, value) {
    console.debug('[da-form-editor] emit replace', { path: pointer, value });
    this.dispatchEvent(new CustomEvent('form-model-intent', {
      detail: { op: 'replace', path: pointer, value },
      bubbles: true,
      composed: true,
    }));
  }

  renderCheckbox(item) {
    return html`
      <sl-checkbox
        class="form-input"
        name="${item.key}"
        label="${item.schema.title}"
        .checked=${item.data ?? false}
        data-pointer="${item.pointer}"
        @change=${(e) => this.emitReplace(item.pointer, e.target.checked)}
      ></sl-checkbox>
    `;
  }

  renderPrimitive(item) {
    const primitives = ['string', 'boolean', 'number'];
    const prim = primitives.find((type) => type === item.schema.properties.type);
    if (prim) {
      if (prim === 'boolean') return this.renderCheckbox(item);

      // long-text semantic type -> textarea
      if (item.schema.properties['x-semantic-type'] === 'long-text') {
        return html`
          <sl-textarea-extended
            class="form-input"
            label="${item.schema.title}"
            .value=${item.data ?? ''}
            data-pointer="${item.pointer}"
            @change=${(e) => this.emitReplace(item.pointer, e.target.value)} 
          ></sl-textarea-extended>
        `;
      }

      // enum -> select (covers string enums and array items with enum)
      const enumOptions = item.schema.properties.enum
        || item.schema.properties.items?.enum;
      if (Array.isArray(enumOptions) && enumOptions.length) {
        const currentValue = Array.isArray(item.data) ? (item.data[0] ?? '') : (item.data ?? '');
        return html`
          <sl-select-extended
            class="form-input"
            name="${item.key}"
            label="${item.schema.title}"
            .value=${currentValue}
            data-pointer="${item.pointer}"
            @change=${(e) => {
            const next = item.schema.properties.type === 'array' ? [e.target.value] : e.target.value;
            this.emitReplace(item.pointer, next);
          }}
          >
            ${enumOptions.map((opt) => html`<option value="${opt}">${opt}</option>`)}
          </sl-select-extended>
        `;
      }

      return html`
        <sl-input-extended
          class="form-input"
          type="text"
          label="${item.schema.title}"
          .value=${item.data ?? ''}
          data-pointer="${item.pointer}"
          @change=${(e) => this.emitReplace(item.pointer, e.target.value)}
        ></sl-input-extended>
      `;
    }

    return nothing;
  }

  renderList(parent) {
    if (parent.schema.properties.items?.type) return nothing;

    if (!Array.isArray(parent.data)) return this.renderPrimitive(parent);

    return html`
      <form-item-group
        class="item-group"
        data-key="${parent.pointer}"
        pointer="${parent.pointer}"
        label="${parent.schema.title}"
      >
        ${parent.data
        ? html`${parent.data.map((item) => this.renderList(item))}`
        : nothing}
      </form-item-group>
    `;
  }

  render() {
    if (!this._data) return nothing;

    return html`
      <div class="form-header">
        <h2>${this._data.schema.title}</h2>
      </div>
      <form>
        <div>
          ${this.renderList(this._data)}
        </div>
      </form>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
