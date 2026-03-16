import { LitElement, html, nothing } from 'da-lit';
import { ICONS } from '../utils/constants.js';
import getSheet from '../../../../../shared/sheet.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class PfLabel extends LitElement {
  static properties = {
    badge: { attribute: false },
    text: { attribute: false },
    icon: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  update(updates) {
    if (updates.get('badge')) {
      this.className = `badge-${this.badge}`;
    }
    super.update();
  }

  renderMore() {
    if (!this.text && !this.icon) return nothing;
    return html`
      <div class="more">
        ${this.text ? html`<p class="label-text">${this.text}</p>` : nothing}
        ${this.icon ? html`<svg class="icon" viewBox="0 0 20 20"><use href="${this.icon}"/></svg>` : nothing}
        <p class="label-type hide-visually">${this.badge}</p>
      </div>`;
  }

  render() {
    const icon = ICONS.get(this.badge);
    return html`
      <button class="item-header-expand badge-${this.badge}">
        <div class="filled-icon">
          <svg class="icon" viewBox="0 0 20 20"><use href="${icon}"/></svg>
        </div>
        ${this.renderMore()}
      </button>`;
  }
}

customElements.define('pf-label', PfLabel);
