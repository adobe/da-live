import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import renderForm from '../utils/form.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

class FormEditor extends LitElement {
  static properties = {
    formModel: { state: true },
    _form: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this._form = renderForm(this.formModel);
    }
    super.update(props);
  }

  render() {
    if (!this._form) return nothing;
    return html`<div>${this._form}</div>`;
  }
}

customElements.define('da-form-editor', FormEditor);
