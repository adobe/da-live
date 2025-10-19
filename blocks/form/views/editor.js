import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import renderForm from '../utils/form.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

class FormEditor extends LitElement {
  static properties = {
    schemas: { attribute: false },
    json: { attribute: false },
    _form: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  update(props) {
    console.log(props);
    if (props.has('json') || props.has('schemas')) {
      if (this.json && this.schemas) {
        this.getForm();
      }
    }
    super.update(props);
  }

  async getForm() {
    this._form = await renderForm(this.json);
    console.log(this._form);
  }

  render() {
    return html`
    <p class="da-form-title">Edit</p>
    <form>${this._form}</form>`;
  }
}

customElements.define('da-form-editor', FormEditor);
