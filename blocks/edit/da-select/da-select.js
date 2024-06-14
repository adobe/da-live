import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-select/da-select.css');

class DaSelect extends LitElement {
  static properties = {
    title: { state: true },
    items: { state: true },
    callback: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  internalClose() {
    this.remove();
    this.dispatchEvent(new Event('closed'));
  }

  close(e) {
    e?.preventDefault();
    this.internalClose();
  }

  select(e, item) {
    this.callback(item);
    const proseEl = window.view.root.querySelector('.ProseMirror');
    proseEl.focus();
  }

  getChoices(e) {
    return html`
      ${this.items.map((item) => html`
        <button @click=${() => this.select(e, item)}>${item}</button>
      `)}
    `;
  }

  render() {
    return html`
      <form class="da-select-form">
        <h5>${this.title}</h5>
        <div class="da-select-buttons">
          ${this.getChoices()}
        </div>
        <div>
          <button class="da-select-close" @click=${this.close}>Close</button>
        </div
      </form>`;
  }
}

customElements.define('da-select', DaSelect);

export default function openSelect({ title, items, callback }) {
  const pane = window.view.dom.nextElementSibling;
  const select = document.createElement('da-select');
  select.title = title;
  select.items = items;
  select.callback = callback;
  pane.append(select);
  return select;
}
