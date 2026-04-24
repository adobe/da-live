import { LitElement, html } from 'da-lit';
import { SUPPORTED_LOCALES, getLocale, setLocale, I18nController, t } from '../i18n.js';
import getSheet from '../sheet.js';

const sheet = await getSheet('/blocks/shared/da-locale-switcher/da-locale-switcher.css');

class DaLocaleSwitcher extends LitElement {
  // Trigger re-render when the active locale changes.
  // eslint-disable-next-line no-unused-private-class-members
  #i18n = new I18nController(this);

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  handleChange(e) {
    setLocale(e.target.value);
  }

  render() {
    const active = getLocale();
    return html`
      <label class="da-locale-label" for="da-locale-select">${t('locale.switcher.label')}</label>
      <select id="da-locale-select" class="da-locale-select" @change=${this.handleChange} aria-label=${t('locale.switcher.label')}>
        ${SUPPORTED_LOCALES.map((code) => html`
          <option value=${code} ?selected=${code === active}>${t(`locale.name.${code}`)}</option>
        `)}
      </select>
    `;
  }
}

customElements.define('da-locale-switcher', DaLocaleSwitcher);
