import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { ref, createRef } from '../../../deps/lit/dist/index.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

/**
 * JSON preview panel component.
 * Displays formatted and syntax-highlighted JSON representation of the form model.
 * Updates reactively when form data changes and uses Prism for highlighting.
 */
class FormPreview extends LitElement {
  static properties = { formModel: { attribute: false } };

  constructor() {
    super();
    this._wrapperRef = createRef();
    this._preRef = createRef();
    this._codeRef = createRef();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated() {
    if (this.formModel) {
      this.setPreview();
    }
  }

  async setPreview() {
    this.toggleVis();
    await this.loadPrism();
    const codeEl = this._codeRef.value;
    if (codeEl) codeEl.remove();

    const preEl = this._preRef.value;
    if (preEl) {
      const code = document.createElement('code');
      code.classList.add('language-json');
      // Store ref for future access
      this._codeRef.value = code;
      preEl.append(code);
      code.textContent = JSON.stringify(this.formModel.json, null, 2);
      window.Prism.highlightElement(code);
    }
    this.toggleVis();
  }

  async loadPrism() {
    if (!this.prism) {
      await import('../deps/prism.js');
      await import('../deps/prism-json.min.js');
      this.prism = true;
    }
  }

  toggleVis() {
    const wrapper = this._wrapperRef.value;
    if (wrapper) {
      wrapper.classList.toggle('is-visible');
    }
  }

  get pre() {
    return this._preRef.value;
  }

  get code() {
    return this._codeRef.value;
  }

  render() {
    return html`
      <div class="vis-wrapper is-visible" ${ref(this._wrapperRef)}>
        <p class="da-title">Preview</p>
        <pre ${ref(this._preRef)}></pre>
      </div>`;
  }
}

customElements.define('da-form-preview', FormPreview);
