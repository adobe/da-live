import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';

const nx2 = getNx2();
const [
  { getRepositoryConfig },
  { buildAssetSelectorProps },
  { loadAssetSelector },
] = await Promise.all([
  import(`${nx2}/utils/aem-assets/repository-config.js`),
  import(`${nx2}/utils/aem-assets/selector-props.js`),
  import(`${nx2}/utils/aem-assets/selector.js`),
]);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

export const NOT_CONFIGURED_ERROR = 'AEM Assets is not configured for this site.';
export const SIGN_IN_ERROR = 'Sign in to browse AEM Assets.';

/**
 * Renders the AEM asset selector in rail (read-only, display-only) mode into `container`.
 * No handlers are passed; nothing is inserted on selection.
 */
export async function renderAssetsRail({ container, org, site }) {
  const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
  const ims = await loadIms();
  if (ims?.anonymous) handleSignIn();
  const token = ims?.accessToken?.token;
  if (!token) return { error: SIGN_IN_ERROR };

  const repoConfig = await getRepositoryConfig(org, site);
  if (!repoConfig) return { error: NOT_CONFIGURED_ERROR };

  const { selectors, error } = await loadAssetSelector();
  if (error) return { error };

  selectors.renderAssetSelector(container, buildAssetSelectorProps({
    imsToken: token,
    repoConfig,
    rail: true,
  }));

  return {};
}

class EwCanvasAssets extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  async firstUpdated() {
    // The selector renders directly into this div; Lit never re-renders into it
    // again (the template has no bindings inside it), so the selector's own DOM
    // survives every subsequent Lit update of this element.
    const container = this.shadowRoot.querySelector('.assets-rail');
    const { error } = await renderAssetsRail({ container, org: this.org, site: this.site });
    if (error) this._error = error;
  }

  render() {
    return html`
      <div class="assets-rail"></div>
      ${this._error ? html`<p class="assets-rail-error">${this._error}</p>` : nothing}
    `;
  }
}

customElements.define('ew-canvas-assets', EwCanvasAssets);
