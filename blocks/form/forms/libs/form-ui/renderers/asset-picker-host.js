import { render } from 'da-lit';
import { assetPickerModalTemplate } from '../templates/asset-picker/modal.js';

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/assets/resources/assets-selectors.js';

let scriptsLoaded = false;
let hostInstance = null;

async function loadScriptOnce(src) {
  if (document.querySelector(`script[data-src="${src}"]`)) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.dataset.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadStyleOnce(href) {
  if (document.querySelector(`link[data-href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.href = href;
  document.head.appendChild(link);
}

function ensureDialog() {
  let dialog = document.querySelector('.da-dialog-asset');
  if (!dialog) {
    const mount = document.createElement('div');
    render(assetPickerModalTemplate(), mount);
    dialog = mount.firstElementChild;
    const parent = document.body.querySelector('main') || document.body;
    parent.insertAdjacentElement('afterend', dialog);
  }
  const assetSelectorWrapper = dialog.querySelector('.da-dialog-asset-inner[data-part="assets"]');
  return { dialog, assetSelectorWrapper };
}

class AssetPickerHost {
  constructor() {
    this.dialog = null;
    this.assetSelectorWrapper = null;
    this.initialized = false;
    this.helpers = null;
    this.meta = null;
    this.callbacks = null;
    this._hasEmittedResult = false;
  }


  async show({ selectorConfig, meta, helpers, callbacks }) {
    // no transient flags used
    await loadStyleOnce(new URL('../styles/asset-picker.css', import.meta.url).href);
    if (!scriptsLoaded) {
      await loadScriptOnce(ASSET_SELECTOR_URL);
      scriptsLoaded = true;
    }
    if (!window.PureJSSelectors || !window.PureJSSelectors.renderAssetSelector) {
      throw new Error('Assets selector library failed to load');
    }

    const { dialog, assetSelectorWrapper } = ensureDialog();
    this.dialog = dialog;
    this.assetSelectorWrapper = assetSelectorWrapper;

    // store context for helper methods
    this.helpers = helpers || {};
    this.meta = meta || {};
    this.callbacks = callbacks || {};

    // ensure UI is in a clean state on each open
    this._hasEmittedResult = false;

    // Render selector only once (or if somehow emptied), to match library expectations
    if (!this.initialized || (this.assetSelectorWrapper && this.assetSelectorWrapper.childElementCount === 0)) {
      window.PureJSSelectors.renderAssetSelector(this.assetSelectorWrapper, {
        imsToken: selectorConfig.imsToken,
        repositoryId: selectorConfig.repositoryId,
        aemTierType: selectorConfig.aemTierType,
        onClose: () => this.onClose(),
        handleSelection: (assets) => this.handleSelection(assets),
      });
      this.initialized = true;
    }

    this.dialog.showModal();
  }

  emitResult(payload) {
    this._hasEmittedResult = true;
    try { this.dialog.close(); } catch {}
    this.callbacks?.onResult?.(payload);
    this.destroyDialog();
  }

  onClose() {
    if (this.assetSelectorWrapper && this.assetSelectorWrapper.style.display !== 'none') {
      try { this.dialog.close(); } catch {}
      if (!this._hasEmittedResult) this.callbacks?.onCancel?.();
    }
  }

  getMimeType(asset) {
    return ((asset && (asset.mimetype || asset['dc:format'])) || '').toLowerCase();
  }

  isImageAsset(asset) {
    return this.getMimeType(asset).startsWith('image/');
  }

  getMetadata(asset) {
    if (!asset || !asset._embedded) return null;
    return this.meta.aemTierType === 'delivery'
      ? asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/application']
      : asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset'];
  }

  getAssetStatus(asset) {
    const metadata = this.getMetadata(asset);
    return metadata && metadata['dam:assetStatus'];
  }

  async handleSelection(assets) {
    const asset = assets && assets[0];
    if (!asset) return;

    this.finalizeDefaultSelection(asset);
  }


  buildPayload({ asset, src }) {
    const { buildResultObject } = this.helpers;
    const { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt } = this.meta;
    return buildResultObject({ asset, src }, { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt });
  }

  finalizeDefaultSelection(asset) {
    const mimetype = this.getMimeType(asset);
    const renditionLinks = (asset && asset._links && asset._links['http://ns.adobe.com/adobecloud/rel/rendition']) || [];
    const src = this.computeSrcForAsset(asset, mimetype, renditionLinks);
    const payload = this.buildPayload({ asset, src });
    this.emitResult(payload);
  }

  computeSrcForAsset(asset, mimetype, renditionLinks) {
    const { getAssetUrl } = this.helpers;
    const { aemTierType } = this.meta;
    const videoLinkObj = renditionLinks.find((link) => link && link.href && link.href.endsWith('/play'));
    const videoLink = videoLinkObj && videoLinkObj.href;
    if (aemTierType === 'author') return getAssetUrl(asset);
    if (mimetype.startsWith('video/')) return videoLink;
    return (renditionLinks[0] && renditionLinks[0].href && renditionLinks[0].href.split('?')[0]) || null;
  }

  close() {
    if (this.dialog) {
      try { this.dialog.close(); } catch {}
    }
  }

  destroyDialog() {
    try {
      if (this.dialog && this.dialog.parentNode) {
        this.dialog.parentNode.removeChild(this.dialog);
      }
    } catch {}
    this.dialog = null;
    this.assetSelectorWrapper = null;
    this.initialized = false;
  }
}

export function getAssetPickerHost() {
  if (!hostInstance) hostInstance = new AssetPickerHost();
  return hostInstance;
}

export default { getAssetPickerHost };


