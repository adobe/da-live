import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { loadGroups, navigateOrCreateNew } from './utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaMore extends LitElement {
  static properties = {
    details: { attribute: false },
    defaultEditor: { attribute: false },
    _name: { state: true },
    _groups: { state: true },
    _selected: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    this.getGroups();
    this._name = 'testing-123';
  }

  async getGroups() {
    this._groups = await loadGroups(this.details.owner, this.details.repo);
  }

  handleSelect(editor, template) {
    if (this._selected?.template === template) {
      this._selected = undefined;
      return;
    }
    this._selected = { editor, template };
  }

  handleInput({ target }) {
    this._name = target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  async handleCreate() {
    this._message = 'Creating...';
    const newPath = `${this.details.fullpath}/${this._name}.html`;
    const message = await navigateOrCreateNew(this.defaultEditor, this._selected, newPath);
    if (message) this._message = message;
  }

  get _action() {
    return {
      style: 'accent',
      label: 'Create',
      click: () => this.handleCreate(),
      disabled: !this._selected || !this._name || this._message,
    };
  }

  renderInput() {
    return html`
      <div class="more-name-container">
        <label for="more-name">Name</label>
        <input
          type="text"
          id="more-name"
          name="more-name"
          placeholder="name-of-document"
          .value=${this._name || ''}
          @input=${this.handleInput}/>
      </div>`;
  }

  render() {
    if (!this._groups) return nothing;
    return html`
      <da-dialog
        title="Create new"
        class="more-dialog"
        .message=${this._message}
        .action=${this._action}>
        <ul class="more-list">
          ${this._groups.map((group) => html`
            <li>
              <p class="more-group-title">${group.title}</p>
              <ul class="template-list">
                ${group.templates.map((template) => html`
                  <li>
                    <button
                      class="${this._selected?.template === template ? 'is-selected' : ''}"
                      @click=${() => this.handleSelect(group, template)}>
                      ${template.title || template.name || template.key}
                    </button></li>
                `)}
              </ul>
            </li>
          `)}
        </ul>
        ${this._message ? nothing : this.renderInput()}
      </da-dialog>
    `;
  }
}

customElements.define('da-more', DaMore);
