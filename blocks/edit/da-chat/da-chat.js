import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { LitElement, html } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { daFetch } from '../../shared/utils.js';

const sheet = await getSheet('/blocks/edit/da-chat/da-chat.css');

class DaChat extends LitElement {
  static properties = {
    open: { attribute: false },
    path: { type: String },
    _doc: { state: true },
    _mockText: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._mockText = 'Something not controversial';
    this.getDoc();
  }

  async getDoc() {
    const resp = await daFetch(`${DA_ORIGIN}/source${this.path}`);
    if (!resp.ok) return;
    const text = await resp.text();
    const parser = new DOMParser();
    this._doc = parser.parseFromString(text, 'text/html');
  }

  async handleMockUpdate() {
    // Update with ProseMirror
    const dom = new DOMParser().parseFromString(`<p>${this._mockText}</p>`, 'text/html');
    const nodes = proseDOMParser.fromSchema(window.view.state.schema).parse(dom);
    window.view.dispatch(window.view.state.tr.replaceSelectionWith(nodes));

    // Update with Fetch
    // const main = this._doc.querySelector('main');
    // main.insertAdjacentHTML('afterbegin', `<p>${this._mockText}</p>`);

    // const text = this._doc.body.outerHTML;
    // const data = new Blob([text], { type: 'text/html' });

    // const formData = new FormData();
    // formData.append('data', data);

    // const opts = { method: 'POST', body: formData };
    // const resp = await daFetch(`${DA_ORIGIN}/source${this.path}`, opts);
  }

  handleClose() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('close', opts);
    this.dispatchEvent(event);
  }

  render() {
    return html`
      <div class="da-chat-panel">
        <h1>Chat w/ your AI <br><s>overlord</s> bestie.</h1>
        <p>
          <input type="text" .value=${this._mockText}></input>
          <button @click=${this.handleMockUpdate}>Update doc</button>
        </p>
        <button @click=${this.getDoc}>Get Doc</button>
        <button @click=${this.handleClose}>Close</button>
        
      </div>
    `;
  }
}

customElements.define('da-chat', DaChat);
