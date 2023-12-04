import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/edit/da-library/da-library.css');

const { getLibs } = await import('../../../scripts/utils.js');
const { loadArea } = await import(`${getLibs()}/utils/utils.js`);

class DaLibrary extends LitElement {
  static properties = {
    callback: { state: true },
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  render() {
    return html`
      <iframe frameBorder="0" src="https://main--milo--adobecom.hlx.page/tools/library"></iframe>
    `;
  }
}

customElements.define('da-library', DaLibrary);

export default function openPrompt({ callback }) {
  const palettePane = window.view.dom.nextElementSibling;
  const palette = document.createElement('da-library');
  palette.callback = callback;
  palettePane.append(palette);
}
