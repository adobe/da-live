import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const nx = getNx();

// SL Components
await import(`${nx}/public/sl/components.js`);

// Styles
const { default: getStyle } = await import(`${nx}/utils/styles.js`);
const SL = await getStyle(`${nx}/public/sl/styles.css`);
const STYLE = await getStyle(import.meta.url);

// Detect platform
const isMac = typeof navigator !== 'undefined' && (
  /Mac/.test(navigator.platform)
  || /Mac/.test(navigator.userAgentData?.platform)
  || navigator.platform === 'MacIntel'
);

export default class DaShortcutsModal extends LitElement {
  static properties = { _shortcuts: { state: true } };

  constructor() {
    super();
    this._shortcuts = null;
    this._loadShortcuts();
  }

  async _loadShortcuts() {
    try {
      const response = await fetch('/blocks/shared/da-shortcuts-modal/shortcuts.json');
      this._shortcuts = await response.json();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load shortcuts:', error);
      this._shortcuts = { categories: [] };
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [SL, STYLE];
    setTimeout(() => { this.showModal(); }, 20);

    // Handle '?' key to close (custom behavior - ESC is handled by sl-dialog)
    this._handleKeyDown = (e) => {
      if (e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };

    // Delay to avoid catching the keypress that opened the modal
    setTimeout(() => {
      document.addEventListener('keydown', this._handleKeyDown, true);
    }, 100);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeyDown, true);
  }

  get _dialog() {
    return this.shadowRoot.querySelector('sl-dialog');
  }

  showModal() {
    this._dialog?.showModal();
  }

  close() {
    document.removeEventListener('keydown', this._handleKeyDown, true);
    this._dialog?.close();

    const event = new CustomEvent('close', { bubbles: true, composed: true });
    this.dispatchEvent(event);

    // Remove from DOM
    setTimeout(() => { this.remove(); }, 0);
  }

  renderShortcut(shortcut) {
    const platform = isMac ? 'mac' : 'windows';
    const keys = shortcut.keys[platform];
    return html`
      <div class="shortcut-item">
        <span class="shortcut-label">${shortcut.label}</span>
        <kbd class="shortcut-keys">${keys}</kbd>
      </div>
    `;
  }

  renderCategory(category) {
    return html`
      <div class="shortcuts-column">
        <h3>${category.name}</h3>
        ${category.shortcuts.map((shortcut) => this.renderShortcut(shortcut))}
      </div>
    `;
  }

  render() {
    if (!this._shortcuts) {
      return html`<sl-dialog><div class="shortcuts-modal">Loading...</div></sl-dialog>`;
    }

    return html`
      <sl-dialog @close=${this.close}>
        <div class="shortcuts-modal" role="dialog" aria-labelledby="shortcuts-title" aria-modal="true">
          <div class="shortcuts-header">
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
            <button
              class="close-btn"
              @click=${this.close}
              aria-label="Close shortcuts dialog">
              <svg class="icon" aria-hidden="true"><use href="/blocks/browse/img/S2IconClose20N-icon.svg#S2IconClose20N-icon"></use></svg>
            </button>
          </div>

          <div class="shortcuts-content">
            ${this._shortcuts.categories.map((category) => this.renderCategory(category))}
          </div>

          <div class="shortcuts-footer">
            <button class="close-button" @click=${this.close}>Close</button>
          </div>
        </div>
      </sl-dialog>
    `;
  }
}

customElements.define('da-shortcuts-modal', DaShortcutsModal);

export function openShortcutsModal() {
  // Remove any existing modal
  document.querySelectorAll('da-shortcuts-modal').forEach((modal) => modal.remove());

  // Create and show new modal
  const modal = document.createElement('da-shortcuts-modal');
  document.body.appendChild(modal);
  return modal;
}
