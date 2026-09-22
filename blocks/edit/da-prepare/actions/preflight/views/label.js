import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../../shared/sheet.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

const ICONS = new Map([
  ['success', 'blocks/edit/img/S2_Icon_CheckmarkCircle_20_N.svg#S2_Icon_CheckmarkCircle'],
  ['info', '/blocks/edit/img/S2_Icon_InfoCircle_20_N.svg#S2_Icon_InfoCircle'],
  ['warn', '/blocks/edit/img/S2_Icon_AlertTriangle_20_N.svg#S2_Icon_AlertTriangle'],
  ['error', '/blocks/edit/img/S2_Icon_AlertDiamond_20_N.svg#S2_Icon_AlertDiamond'],
  ['na', '/blocks/edit/img/S2_Icon_InfoCircle_20_N.svg#S2_Icon_InfoCircle'],
  ['pending', '/blocks/edit/img/S2_Icon_ClockPending_20_N.svg#S2_Icon_ClockPending'],
]);

class PfLabel extends LitElement {
  static properties = {
    badge: { attribute: false },
    text: { attribute: false },
    icon: { attribute: false },
    // Only category-summary pills are actionable (expand a category); item-level status
    // badges (result.js, link.js) aren't, so they shouldn't be a focusable button.
    clickable: { attribute: false },
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

  renderInner() {
    const icon = ICONS.get(this.badge);
    return html`
      <div class="filled-icon">
        <svg class="icon" viewBox="0 0 20 20"><use href="${icon}"/></svg>
      </div>
      ${this.renderMore()}`;
  }

  render() {
    const classes = `item-header-expand badge-${this.badge}`;
    if (this.clickable) {
      return html`<button type="button" class="${classes}">${this.renderInner()}</button>`;
    }
    return html`<div class="${classes}">${this.renderInner()}</div>`;
  }
}

customElements.define('pf-label', PfLabel);
