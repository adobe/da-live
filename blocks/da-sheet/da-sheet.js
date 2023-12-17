import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

import getSheet from '../shared/sheet.js';
const sheet = await getSheet('/blocks/da-sheet/da-sheet.css');
const jsheet = await getSheet('/deps/jspreadsheet/dist/jspreadsheet.css');
const jsuite = await getSheet('/deps/jspreadsheet/dist/jsuites.css');

class DaSheet extends LitElement {
  static properties = {
    
  };

  constructor() {
    super();
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet, jsheet, jsuite];
  }

  render() {
    return html`
      <h1>Hello</h1>
      <div class="jsheet-editor">
    `;
  }

  updated(props) {
    const data = [
      ['PHP', '14:00'],
      ['Javascript', '16:30'],
    ];
    const editor = this.shadowRoot.querySelector('.jsheet-editor');

    jspreadsheet(editor, { data });
  }
}

customElements.define('da-sheet', DaSheet);
