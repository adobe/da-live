import { LitElement, html } from 'da-lit';

export default class DaToast extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    message: { type: String },
    variant: { type: String },
  };

  constructor() {
    super();
    this.open = false;
    this.message = '';
    this.variant = 'warning';
    this._hideTimer = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._hideTimer) clearTimeout(this._hideTimer);
  }

  show(message, { variant = 'warning', timeout = 3500 } = {}) {
    this.message = message || '';
    this.variant = variant;
    this.open = true;
    if (this._hideTimer) clearTimeout(this._hideTimer);
    if (timeout > 0) {
      this._hideTimer = setTimeout(() => { this.open = false; }, timeout);
    }
  }

  render() {
    const color = this.variant === 'error' ? 'rgb(239, 68, 68)'
      : (this.variant === 'success' ? '#16a34a' : '#f59e0b');
    return html`
      <style>
        :host { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 100000; }
        .toast { 
          display: ${this.open ? 'flex' : 'none'}; 
          align-items: center; gap: 10px; 
          max-width: 520px; padding: 10px 14px; 
          border-radius: 8px; color: #fff; background: ${color}; 
          box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          font-size: 14px; line-height: 1.3;
        }
        .close { background: transparent; border: none; color: #fff; cursor: pointer; font-size: 16px; }
      </style>
      <div class="toast" role="status" aria-live="polite">
        <div>${this.message}</div>
        <button class="close" aria-label="Close" @click=${() => { this.open = false; }}>×</button>
      </div>
    `;
  }
}

customElements.define('da-toast', DaToast);


