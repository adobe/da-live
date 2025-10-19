import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

/**
 * FormsEditor
 *
 * Standalone web component that loads a page's form data from DA, lets the
 * user pick a JSON Schema, mounts the schema-driven Form UI, and provides
 * actions to save/preview/publish via backend services.
 */
class FormPreview extends LitElement {
  static properties = {
    json: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated() {
    if (this.json) {
      this.setPreview();
    }
  }

  async setPreview() {
    await this.loadPrism();

    // Remove the existing code el for simplicity
    if (this.code) this.code.remove();

    const code = document.createElement('code');
    code.classList.add('language-json');
    this.pre.append(code);

    code.textContent = JSON.stringify(this.json, null, 2);
    window.Prism.highlightElement(code);
  }

  async loadPrism() {
    if (!this.prism) {
      await import('../deps/prism.js');
      await import('../deps/prism-json.min.js');
      this.prism = true;
    }
  }

  get pre() {
    return this.shadowRoot.querySelector('pre');
  }

  get code() {
    return this.shadowRoot.querySelector('code');
  }

  render() {
    return html`
    <p class="da-title">Preview</p>
    <pre></pre>`;
  }
}

customElements.define('da-form-preview', FormPreview);
