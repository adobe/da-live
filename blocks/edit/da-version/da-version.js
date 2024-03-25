import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import getSheet from '../../shared/sheet.js';

// TODO we could split up the editor sheet into a shared prosemirror one instead
const editorSheet = await getSheet('/blocks/edit/da-editor/da-editor.css');
const sheet = await getSheet('/blocks/edit/da-version/da-version.css');

export default class DaVersion extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [editorSheet, sheet];
  }

  render() {
    return html`
    <div class="da-version-view">
      <div contenteditable="false" translate="no" class="ProseMirror">
      </div>
    </div>
    `;
  }
}

customElements.define('da-version', DaVersion);
