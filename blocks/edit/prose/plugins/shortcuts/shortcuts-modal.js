import { LitElement, html } from 'da-lit';
import { getNx } from '../../../../../scripts/utils.js';
import { formatShortcut, SHORTCUTS } from './shortcutsHelpers.js';

const nx = getNx();

// SL Components
await import(`${nx}/public/sl/components.js`);

// Styles
const { default: getStyle } = await import(`${nx}/utils/styles.js`);
const SL = await getStyle(`${nx}/public/sl/styles.css`);
const STYLE = await getStyle(import.meta.url);

export default class DaShortcutsModal extends LitElement {
  static properties = { _isOpen: { state: true } };

  constructor() {
    super();
    this._isOpen = false;
    this._isClosing = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [SL, STYLE];
    setTimeout(() => { this.showModal(); }, 20);

    // Close on Escape or '?'
    this._handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };

    // Close on click outside (backdrop click)
    this._handleBackdropClick = (e) => {
      const dialog = this.shadowRoot.querySelector('sl-dialog');
      if (!dialog) return;

      // Get the native dialog element inside sl-dialog
      const nativeDialog = dialog.shadowRoot?.querySelector('dialog');
      if (!nativeDialog) return;

      // Check if click was on the backdrop (dialog itself, not its children)
      if (e.target === nativeDialog) {
        this.close();
      }
    };

    // Delay adding the keydown listener to avoid catching the same keypress that opened the modal
    setTimeout(() => {
      document.addEventListener('keydown', this._handleKeyDown, true);

      // Add backdrop click listener
      const dialog = this.shadowRoot.querySelector('sl-dialog');
      if (dialog) {
        const nativeDialog = dialog.shadowRoot?.querySelector('dialog');
        if (nativeDialog) {
          nativeDialog.addEventListener('click', this._handleBackdropClick);
        }
      }
    }, 100);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._handleKeyDown) {
      document.removeEventListener('keydown', this._handleKeyDown, true);
    }
    if (this._handleBackdropClick) {
      const dialog = this.shadowRoot.querySelector('sl-dialog');
      if (dialog) {
        const nativeDialog = dialog.shadowRoot?.querySelector('dialog');
        if (nativeDialog) {
          nativeDialog.removeEventListener('click', this._handleBackdropClick);
        }
      }
    }
  }

  showModal() {
    const dialog = this.shadowRoot.querySelector('sl-dialog');
    if (dialog) {
      dialog.showModal();
      this._isOpen = true;

      // Set focus to the close button for keyboard accessibility
      setTimeout(() => {
        const closeBtn = this.shadowRoot.querySelector('.close-btn');
        if (closeBtn) closeBtn.focus();
      }, 50);
    }
  }

  close() {
    // Prevent recursive calls
    if (this._isClosing) return;

    this._isClosing = true;

    // Remove keydown listener immediately
    if (this._handleKeyDown) {
      document.removeEventListener('keydown', this._handleKeyDown, true);
    }

    // Remove backdrop click listener
    if (this._handleBackdropClick) {
      const dialog = this.shadowRoot.querySelector('sl-dialog');
      if (dialog) {
        const nativeDialog = dialog.shadowRoot?.querySelector('dialog');
        if (nativeDialog) {
          nativeDialog.removeEventListener('click', this._handleBackdropClick);
        }
      }
    }

    const dialog = this.shadowRoot.querySelector('sl-dialog');
    if (dialog) {
      dialog.close();
    }
    this._isOpen = false;

    // Dispatch close event before removing
    const event = new CustomEvent('close', { bubbles: true, composed: true });
    this.dispatchEvent(event);

    // Remove element from DOM after a small delay to allow event to propagate
    setTimeout(() => {
      this.remove();
    }, 0);
  }

  renderShortcut(label, shortcut) {
    return html`
      <div class="shortcut-item">
        <span class="shortcut-label">${label}</span>
        <kbd class="shortcut-keys">${formatShortcut(shortcut)}</kbd>
      </div>
    `;
  }

  render() {
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
            <div class="shortcuts-column">
              <h3>Text Formatting</h3>
              ${this.renderShortcut('Bold', SHORTCUTS.BOLD)}
              ${this.renderShortcut('Italic', SHORTCUTS.ITALIC)}
              ${this.renderShortcut('Underline', SHORTCUTS.UNDERLINE)}
              ${this.renderShortcut('Link', SHORTCUTS.LINK)}
            </div>

            <div class="shortcuts-column">
              <h3>Text Styles</h3>
              ${this.renderShortcut('Paragraph', SHORTCUTS.PARAGRAPH)}
              ${this.renderShortcut('Heading 1', SHORTCUTS.H1)}
              ${this.renderShortcut('Heading 2', SHORTCUTS.H2)}
              ${this.renderShortcut('Heading 3', SHORTCUTS.H3)}
              ${this.renderShortcut('Heading 4', SHORTCUTS.H4)}
              ${this.renderShortcut('Heading 5', SHORTCUTS.H5)}
              ${this.renderShortcut('Heading 6', SHORTCUTS.H6)}
            </div>

            <div class="shortcuts-column">
              <h3>History</h3>
              ${this.renderShortcut('Undo', SHORTCUTS.UNDO)}
              ${this.renderShortcut('Redo', SHORTCUTS.REDO)}
            </div>

            <div class="shortcuts-column">
              <h3>Other</h3>
              ${this.renderShortcut('Toggle library', SHORTCUTS.LIBRARY)}
              ${this.renderShortcut('Show this dialog', '?')}
            </div>
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
