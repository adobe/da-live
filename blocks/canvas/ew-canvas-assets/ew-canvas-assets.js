import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { createAssetDragHandlers } from './drop.js';

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

const VIEW_ID = 'aem-assets-panel';

/**
 * Renders the AEM asset selector in rail mode into `container`.
 * Clicking an asset does not insert it; dragging uses the selector's iframe bridge.
 *
 * `isLive`, when provided, is re-checked after every await; if it returns false the
 * selector is not rendered (the caller may have removed `container` in the meantime)
 * and `{ skipped: true }` is returned instead.
 */
export async function renderAssetsRail({
  container, org, site, isLive = () => true, getPreview, onCleanup,
}) {
  const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
  const ims = await loadIms();
  if (ims?.anonymous) handleSignIn();
  const token = ims?.accessToken?.token;
  if (!token) return { error: SIGN_IN_ERROR };
  if (!isLive()) return { skipped: true };

  const repoConfig = await getRepositoryConfig(org, site);
  if (!repoConfig) return { error: NOT_CONFIGURED_ERROR };
  if (!isLive()) return { skipped: true };

  const { selectors, error } = await loadAssetSelector();
  if (error) return { error };
  if (!isLive()) return { skipped: true };

  const props = buildAssetSelectorProps({
    imsToken: token,
    repoConfig,
    rail: true,
    dragAndDrop: true,
  });
  const { destroy, ...dragHandlers } = createAssetDragHandlers(
    { container, isLive, getPreview, style },
  );
  onCleanup?.(destroy);
  selectors.renderAssetSelector(container, {
    ...props,
    acvConfig: {
      ...props.acvConfig,
      dragOptions: { ...props.acvConfig?.dragOptions, iframe: true },
    },
    ...dragHandlers,
  });

  return { token };
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
    this._unsubPreview = canvasBus.wysiwygPortReady.subscribe((preview) => {
      this._preview = preview;
    });
    this._unsubViewState = canvasBus.toolPanelViewState.subscribe((activeId) => {
      this._onViewState(activeId);
    });
    // A race in a previous render (I-3) skipped actually rendering the selector;
    // retry now that the element is connected again.
    if (this.hasUpdated && !this._attempted) this._renderSelector();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyDrag?.();
    this._unsubViewState?.();
    this._unsubPreview?.();
    this._preview = undefined;
  }

  async firstUpdated() {
    // The selector renders directly into this div; Lit never re-renders into it
    // again (the template has no bindings inside it), so the selector's own DOM
    // survives every subsequent Lit update of this element.
    await this._renderSelector();
  }

  async _renderSelector() {
    this._destroyDrag?.();
    const container = this.shadowRoot.querySelector('.assets-rail');
    const isLive = () => this.isConnected;
    const result = await renderAssetsRail({
      container,
      org: this.org,
      site: this.site,
      isLive,
      getPreview: () => this._preview,
      onCleanup: (destroy) => { this._destroyDrag = destroy; },
    });
    if (result.skipped) return;
    this._attempted = true;
    if (result.error) {
      this._error = result.error;
      this._token = undefined;
      return;
    }
    this._error = undefined;
    this._token = result.token;
  }

  async _onViewState(activeId) {
    // Only this panel becoming visible, and only once a selector has already
    // rendered successfully, warrants re-checking for a stale IMS token.
    if (activeId !== VIEW_ID || !this._token) return;
    const { loadIms } = await import(`${getNx()}/utils/ims.js`);
    const ims = await loadIms();
    const token = ims?.accessToken?.token;
    if (!token || token === this._token) return;
    const container = this.shadowRoot.querySelector('.assets-rail');
    container.replaceChildren();
    await this._renderSelector();
  }

  render() {
    return html`
      <div class="assets-rail" ?hidden=${!!this._error}></div>
      ${this._error ? html`<p class="assets-rail-error">${this._error}</p>` : nothing}
    `;
  }
}

customElements.define('ew-canvas-assets', EwCanvasAssets);
