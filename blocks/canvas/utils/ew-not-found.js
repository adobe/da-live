import { LitElement, html } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);
const form = await getSheet(`${getNx2()}/styles/form.css`);

// A missing document's canvas path reduces to its site root, which is EW's
// document library (the file-explorer panel). Folder paths are not valid canvas
// locations - loading one as a document would 404 and re-open this dialog - so
// Cancel always returns to the library rather than the immediate parent folder.
export function libraryHashFromPath(path) {
  const [org, site] = (path || '').split('/');
  return org && site ? `#/${org}/${site}` : '#/';
}

// Mirrors blocks/edit/da-not-found: an nx-dialog wrapper whose showEwNotFoundDialog
// helper resolves to 'create' | 'cancel' | 'hashchange'. Navigating away
// (hashchange) cancels the prompt so a stale not-found dialog can't flash over the
// newly loaded editor.
class EwNotFound extends LitElement {
  static properties = {
    name: { type: String },
    onChoice: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form];
    window.addEventListener('hashchange', this._onHashChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this._onHashChange);
  }

  _onHashChange = () => this._finish('hashchange');

  _finish(result) {
    if (this._resolved) return;
    this._resolved = true;
    window.removeEventListener('hashchange', this._onHashChange);
    this.onChoice?.(result);
    // Dismiss the UI; the close handler removes the element.
    this.shadowRoot.querySelector('nx-dialog')?.close();
  }

  // Fires for every dismiss path (Escape, backdrop, or our own close() call).
  _onClose = () => {
    this._finish('cancel');
    this.remove();
  };

  render() {
    // Lit escapes the interpolated name (a URL path segment), so it can't inject
    // markup into the message.
    return html`
      <nx-dialog title="Document not found" @close=${this._onClose}>
        <p>There is no document named <b><em>${this.name}</em></b> at this path.</p>
        <p>What would you like to do?</p>
        <button type="button" slot="actions" class="da-btn-secondary"
          @click=${() => this._finish('cancel')}>Cancel</button>
        <button type="button" slot="actions" class="da-btn-primary"
          @click=${() => this._finish('create')}>Create document</button>
      </nx-dialog>`;
  }
}

customElements.define('ew-not-found', EwNotFound);

export default function showEwNotFoundDialog({ name }) {
  return new Promise((resolve) => {
    const el = document.createElement('ew-not-found');
    el.name = name;
    el.onChoice = resolve;
    document.body.append(el);
  });
}
