import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import getSheet from '../shared/sheet.js';
const sheet = await getSheet('/blocks/sheet/da-toolbar.css');

// https://bossanova.uk/jspreadsheet/v4/docs/programmatically-changes
// Has everything you can do to the sheet.
class DaToolbar extends LitElement {
  static properties = {
    sheet: { attribute: false }
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    setTimeout(() => { console.log(this.sheet) }, 1000);
  }

  handleUndo() {
    this.sheet.undo();
  }

  handleRedo() {
    this.sheet.redo();
  }

  render() {
    return html`
      <button class="undo" @click=${this.handleUndo}>Undo</button>
      <button class="redo" @click=${this.handleRedo}>Redo</button>
    `;
  }
}

customElements.define('da-toolbar', DaToolbar);
