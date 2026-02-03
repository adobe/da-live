import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

class FormEditor extends LitElement {
  static properties = {
    formModel: { state: true },
    _data: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.debouncedHandleChange = debounce(this.handleChange.bind(this), 1000);
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getData();
    }
    super.update(props);
  }

  getData() {
    this._data = this.formModel.annotated;
  }

  handleChange({ target }) {
    const { name, value } = target;
    const opts = { detail: { name, value }, bubbles: true, composed: true };
    const event = new CustomEvent('update', opts);
    this.dispatchEvent(event);
  }

  handleInput({ target }) {
    const hello = this.debouncedHandleChange({ target });
  }

  renderCheckbox(item) {
    return html`
      <div>
        <input type="checkbox" name="${item.key}" value="${item.data}" ?checked=${item.data}>
        <label class="primitive-item-title">${item.schema.title}</label>
      </div>
    `;
  }

  renderSelect(item) {
    return html`
      <div>
        <p class="primitive-item-title">${item.schema.title}</p>
        <sl-select name="${item.path}" value="${item.data}" @change=${this.handleChange}>
          ${item.schema.properties.enum.map((val) => html`<option>${val}</option>`)}
        </sl-select>
      </div>
    `;
  }

  renderPrimitive(item) {
    if (item.schema.properties.enum) return this.renderSelect(item);

    const primitives = ['string', 'boolean', 'number'];
    const prim = primitives.find((type) => type === item.schema.properties.type);
    if (prim) {
      if (prim === 'boolean') return this.renderCheckbox(item);
      return html`
        <p class="primitive-item-title">${item.schema.title}</p>
        <sl-input class="da-form-primitive" type="text" name="${item.path}" value="${item.data}" @input=${this.handleInput}></sl-input>
      `;
    }

    return nothing;
  }

  renderList(parent) {
    if (!Array.isArray(parent.data)) return this.renderPrimitive(parent);

    return html`
      <div class="item-group" data-key="${parent.key}">
        <p class="item-title">${parent.schema.title}</p>
        ${parent.data
          ? html`<div class="form-children">${parent.data.map((item) => this.renderList(item))}</div>`
          : nothing}
      </div>
    `;
  }

  render() {
    if (!this._data) return nothing;

    return html`
      <h2>${this._data.schema.title}</h2>
      <form>
        <div>
          ${this.renderList(this._data)}
        </div>
      </form>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
