import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { daFetch } from '../../shared/utils.js';
import { getNx } from '../../../scripts/utils.js';
import getEditPath from '../shared.js';
import { formatDate } from '../../edit/da-versions/helpers.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const { default: getSvg } = await import(`${getNx()}/utils/svg.js`);
const STYLE = await getStyle(import.meta.url);
const ICONS = [
  '/blocks/edit/img/Smock_Cancel_18_N.svg',
  '/blocks/edit/img/Smock_Checkmark_18_N.svg',
  '/blocks/edit/img/Smock_Refresh_18_N.svg',
];

export default class DaListItem extends LitElement {
  static properties = {
    idx: { type: Number },
    name: { type: String },
    path: { type: String },
    date: { type: Number },
    ext: { type: String },
    rename: { type: Boolean },
    allowselect: { type: Boolean },
    isChecked: { attribute: 'ischecked', type: Boolean },
    _isRenaming: { type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async update(props) {
    if (props.has('rename')) {
      if (this.rename) this.selectInput();
    }

    super.update(props);
  }

  selectInput() {
    setTimeout(() => {
      const input = this.shadowRoot.querySelector('.da-item-list-item-rename input');
      input.focus();
      input.select();
    }, 250);
  }

  handleChecked() {
    this.isChecked = !this.isChecked;
    const opts = { detail: { checked: this.isChecked }, bubbles: true, composed: true };
    const event = new CustomEvent('checked', opts);
    this.dispatchEvent(event);
  }

  setStatus(text, description, type) {
    const opts = { detail: { text, description, type }, bubbles: true, composed: true };
    const event = new CustomEvent('onstatus', opts);
    this.dispatchEvent(event);
  }

  async handleRenameSubmit(e) {
    e.preventDefault();

    const newName = e.target.elements['new-name'].value;

    if (e.submitter.value === 'cancel' || this.name === newName) {
      this.handleChecked();
    } else {
      const idx = this.path.lastIndexOf(this.name);
      const oldPath = this.path;
      const newPath = `${this.path.slice(0, idx)}${newName}${this.path.slice(idx + this.name.length)}`;

      const formData = new FormData();
      formData.append('destination', newPath);
      const opts = { body: formData, method: 'POST' };

      this.name = newName;
      this.path = newPath;
      this.rename = false;
      this._isRenaming = true;

      const showStatus = setTimeout(() => { this.setStatus('Renaming', 'Please be patient. Renaming items with many children can take time.'); }, 5000);
      const resp = await daFetch(`${DA_ORIGIN}/move${oldPath}`, opts);

      if (resp.status === 204) {
        clearTimeout(showStatus);
        this.setStatus();
        this._isRenaming = false;
        // Uncheck the item and bubble up state
        this.handleChecked();
      } else {
        this.setStatus('There was an error. Refresh and try again.', 'error');
      }
    }

    // this.requestUpdate();
  }

  renderDate() {
    if (!this.date) return nothing;
    const { date, time } = formatDate(this.date);
    return `${date} ${time}`;
  }

  renderRename() {
    return html`
      <form class="da-item-list-item-rename" @submit=${this.handleRenameSubmit}>
        <span class="da-item-list-item-type ${this.ext ? 'da-item-list-item-type-file' : 'da-item-list-item-type-folder'} ${this.ext ? `da-item-list-item-icon-${this.ext}` : ''}">
        </span>
        <input type="text" value="${this.name}" name="new-name">
        <div class="da-item-list-item-rename-actions">
          <button aria-label="Confirm" value="confirm">
            <svg class="icon"><use href="#spectrum-Checkmark"/></svg>
          </button>
          <button aria-label="Cancel" value="cancel">
            <svg class="icon"><use href="#spectrum-Cancel"/></svg>
          </button>
        </div>
      </form>
    `;
  }

  renderItem() {
    return html`
      <a href="${this.ext ? getEditPath({ path: this.path, ext: this.ext }) : `#${this.path}`}" class="da-item-list-item-title">
        ${this._isRenaming ? html`
          <span class="da-item-list-item-type">
            <svg class="icon rename-icon"><use href="#spectrum-Refresh"/></svg>
          </span>
        ` : html`
          <span class="da-item-list-item-type ${this.ext ? 'da-item-list-item-type-file' : 'da-item-list-item-type-folder'} ${this.ext ? `da-item-list-item-icon-${this.ext}` : ''}">
        `}
        </span>
        <div class="da-item-list-item-name">${this.name}</div>
        <div class="da-item-list-item-date">${this.renderDate()}</div>
      </a>`;
  }

  renderCheckBox() {
    return html`
      <div class="checkbox-wrapper">
        <input type="checkbox" name="item-selected" id="item-selected-${this.idx}" .checked="${this.isChecked}" @click="${() => { this.handleChecked(); }}">
        <label class="checkbox-label" for="item-selected-${this.idx}"></label>
      </div>
      <input type="checkbox" name="select" style="display: none;">
    `;
  }

  render() {
    return html`
      <div class="da-item-list-item-inner">
        ${this.allowselect ? this.renderCheckBox() : nothing}
        ${this.rename ? this.renderRename() : this.renderItem()}
      </div>`;
  }
}

customElements.define('da-list-item', DaListItem);
