import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-palette/da-palette.css');

class DaPalette extends LitElement {
  static properties = {
    title: { state: true },
    fields: { state: true },
    callback: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  initFocused = false;

  // eslint-disable-next-line no-unused-vars
  updated(_changedProperties) {
    if (!this.initFocused) {
      this.initFocused = true;
      this.focus();
    }
  }

  inputChange(e, key) {
    this.fields[key].value = e.target.value;
  }

  get fieldInputs() {
    return html`
      ${Object.keys(this.fields).map((key) => html`
          <input
            type="text"
            @input=${(e) => { this.inputChange(e, key); }}
            placeholder=${this.fields[key].placeholder}
            value=${this.fields[key].value} />
        `)}
    `;
  }

  // eslint-disable-next-line no-unused-vars
  updateSelection(_view) {
    this.internalClose();
  }

  internalClose() {
    this.remove();
    this.dispatchEvent(new Event('closed'));
  }

  close(e) {
    e.preventDefault();
    this.internalClose();
  }

  submit(e) {
    e.preventDefault();

    const params = {};
    Object.keys(this.fields).forEach((key) => {
      if (!this.fields[key].value) return;
      params[key] = this.fields[key].value;
    });

    this.callback(params);
    this.internalClose();
  }

  focus() {
    if (!this.shadowRoot.activeElement) {
      this.shadowRoot.querySelector('input').focus();
    }
  }

  isOpen() {
    return this.isConnected;
  }

  handleKeyDown(event) {
    switch (event.key) {
      case 'Enter':
        this.submit(event);
        break;
      case 'Escape':
        this.close(event);
        break;
      default:
        break;
    }
  }

  render() {
    return html`
      <form class="da-palette-form" @keydown=${this.handleKeyDown}>
        <h5>${this.title}</h5>
        <div class="da-palette-inputs">
          ${this.fieldInputs}
        </div>
        <div class="da-palette-buttons">
          <button @click=${this.close}>Cancel</button>
          <button @click=${this.submit}>OK</button>
        </div>
      </form>`;
  }
}

customElements.define('da-palette', DaPalette);

export default function openPrompt({ title, fields, callback }) {
  const palettePane = window.view.dom.nextElementSibling;
  const palette = document.createElement('da-palette');
  palette.title = title;
  palette.fields = fields;
  palette.callback = callback;
  palettePane.append(palette);
  return palette;
}
