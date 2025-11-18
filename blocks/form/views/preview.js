import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

class FormPreview extends LitElement {
  static properties = {
    formModel: { attribute: false },
  };

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
    if (this.code) this.code.remove();

    const code = document.createElement('code');
    code.classList.add('language-json');
    this.pre.append(code);

    code.textContent = JSON.stringify(this.formModel.json, null, 2);
    window.Prism.highlightElement(code);
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
    const wrapper = this.shadowRoot.querySelector('.vis-wrapper');
    wrapper.classList.toggle('is-visible');
  }

  get pre() {
    return this.shadowRoot.querySelector('pre');
  }

  get code() {
    return this.shadowRoot.querySelector('code');
  }

  render() {
    return html`
      <div class="vis-wrapper is-visible">
        <p class="da-title">Preview</p>
        <pre></pre>
      </div>`;
  }
}

customElements.define('da-form-preview', FormPreview);
