import { getNx } from '../../../scripts/utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { getResponsiveImageConfig } from '../../edit/da-assets/helpers/config.js';
import { insertImage, insertLink, insertFragment, createImageNode, getBlockName } from '../../edit/da-assets/helpers/insert.js';
import showSmartCropDialog from '../../edit/da-assets/helpers/smart-crop.js';

const { fetchDaConfigs, getFirstSheet } = await import(`${getNx()}/utils/daConfig.js`);

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/static-assets/resources/assets-selectors.js';
const DEFAULT_BASE_PATH = '/adobe/assets';

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export async function getRepositoryConfig(org, site) {
  const configs = await Promise.all(fetchDaConfigs({ org, site }));
  const entries = configs
    .filter((c) => !c?.error)
    .reverse()
    .flatMap((c) => getFirstSheet(c) || []);
  const getValue = (key) => entries.find((e) => e.key === key)?.value || null;

  const repositoryId = getValue('aem.repositoryId');
  if (!repositoryId) return null;

  const tierType = repositoryId.startsWith('delivery') ? 'delivery' : 'author';
  const customOrigin = getValue('aem.assets.prod.origin');
  const isSmartCrop = getValue('aem.asset.smartcrop.select') === 'on';
  const isDmEnabled = getValue('aem.asset.dm.delivery') === 'on'
    || isSmartCrop
    || tierType === 'delivery';

  let assetOrigin;
  if (customOrigin) assetOrigin = customOrigin;
  else if (tierType === 'delivery') assetOrigin = repositoryId;
  else if (isDmEnabled) assetOrigin = repositoryId.replace('author', 'delivery');
  else assetOrigin = repositoryId.replace('author', 'publish');

  const assetBasePath = getValue('aem.assets.prod.basepath') || DEFAULT_BASE_PATH;

  return {
    repositoryId, tierType, assetOrigin, assetBasePath, isDmEnabled, isSmartCrop,
  };
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function buildDeliveryUrl(asset, host, basePath) {
  const id = asset['repo:assetId'] || asset['repo:id'];
  const name = asset['repo:name'] || asset.name || '';
  const seoName = name.includes('.') ? name.split('.').slice(0, -1).join('.') : name;
  return `https://${host}${basePath}/${id}/as/${seoName}.avif`;
}

function buildDmUrl(asset, host, basePath) {
  const base = `https://${host}${basePath}/${asset['repo:id']}`;
  const mimetype = (asset.mimetype || asset['dc:format'] || '').toLowerCase();
  if (mimetype.startsWith('video/')) return `${base}/play`;
  const seoName = asset.name?.includes('.')
    ? asset.name.split('.').slice(0, -1).join('.')
    : asset.name;
  return `${base}/as/${seoName}.avif`;
}

function buildAuthorUrl(asset, publishOrigin) {
  return `https://${publishOrigin}${asset.path}`;
}

export function resolveAssetUrl(asset, config) {
  const { tierType, assetOrigin, assetBasePath, isDmEnabled } = config;
  if (tierType === 'delivery') return buildDeliveryUrl(asset, assetOrigin, assetBasePath);
  if (isDmEnabled) return buildDmUrl(asset, assetOrigin, assetBasePath);
  return buildAuthorUrl(asset, assetOrigin);
}

// ---------------------------------------------------------------------------
// Insertion
// ---------------------------------------------------------------------------

function getAssetAlt(asset) {
  return asset['dc:title']?.['o:default']
    || asset['dc:title']
    || asset.name
    || '';
}

// ---------------------------------------------------------------------------
// Script loader
// ---------------------------------------------------------------------------

let selectorScriptLoaded;

function loadSelectorScript() {
  selectorScriptLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ASSET_SELECTOR_URL;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  return selectorScriptLoaded;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Renders the AEM asset selector into `container`; selections insert into the editor. */
export async function renderAssets({ container, org, site, onClose }) {
  const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
  const ims = await loadIms();
  if (ims?.anonymous) handleSignIn();
  const token = ims?.accessToken?.token;
  if (!token) return;

  const repoConfig = await getRepositoryConfig(org, site);
  if (!repoConfig) return;

  await loadSelectorScript();

  // The panel is rendered inside a shadow root, so link the shared asset-picker
  // styles (blocks/edit/da-assets/da-assets.css) that style the smart-crop UI.
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = new URL('../../edit/da-assets/da-assets.css', import.meta.url).href;
  container.append(styleLink);

  // Two-panel layout: the selector lives in `assetPanel`; the smart-crop picker
  // takes over `secondaryPanel` when needed, matching the old editor.
  const assetPanel = document.createElement('div');
  assetPanel.className = 'da-dialog-asset-inner';
  const secondaryPanel = document.createElement('div');
  secondaryPanel.className = 'da-dialog-asset-inner';
  secondaryPanel.style.display = 'none';
  container.append(assetPanel, secondaryPanel);

  const responsiveImageConfigPromise = repoConfig.isSmartCrop
    ? getResponsiveImageConfig(org, site)
    : Promise.resolve(false);

  const resetToAssetPanel = () => {
    secondaryPanel.style.display = 'none';
    secondaryPanel.innerHTML = '';
    assetPanel.style.display = 'block';
  };
  const closeAndReset = () => {
    onClose?.();
    resetToAssetPanel();
  };

  // Mirrors the old editor's smart-crop flow (blocks/edit/da-assets/da-assets.js): when
  // smart crop is enabled and an image is picked, a crop-picker takes over `secondaryPanel`
  // and the inserted URLs carry the `?smartcrop=<cropName>` param. Otherwise insert plainly.
  const handleSelection = async (assets) => {
    const [asset] = assets;
    if (!asset) return;
    const { view } = getExtensionsBridge();
    if (!view) return;

    const mimetype = (asset.mimetype || asset['dc:format'] || '').toLowerCase();
    const isImage = mimetype.startsWith('image/');
    const alt = getAssetAlt(asset);

    if (isImage && repoConfig.isSmartCrop) {
      const assetUrl = resolveAssetUrl(asset, repoConfig);
      assetPanel.style.display = 'none';
      secondaryPanel.style.display = 'block';

      const hasCrops = await showSmartCropDialog({
        container: secondaryPanel,
        asset,
        assetUrl,
        dmOrigin: repoConfig.assetOrigin,
        dmBasePath: repoConfig.assetBasePath,
        blockName: getBlockName(view),
        responsiveImageConfigPromise,
        onInsert: (srcs) => {
          closeAndReset();
          const nodes = srcs.map((src) => createImageNode(view, src, alt));
          insertFragment(view, nodes);
        },
        onBack: resetToAssetPanel,
        onCancel: closeAndReset,
      });

      if (!hasCrops) {
        closeAndReset();
        insertImage(view, assetUrl, alt);
      }
      return;
    }

    // Standard insertion
    onClose?.();
    const src = resolveAssetUrl(asset, repoConfig);
    if (isImage) {
      insertImage(view, src, alt);
    } else {
      insertLink(view, src);
    }
  };

  const selectorProps = {
    imsToken: token,
    repositoryId: repoConfig.repositoryId,
    aemTierType: repoConfig.tierType,
    featureSet: ['upload', 'collections', 'detail-panel', 'advisor'],
    // Only let the selector's own close affect the dialog while it's the visible panel.
    ...(onClose && { onClose: () => assetPanel.style.display !== 'none' && onClose() }),
    handleSelection,
  };

  window.PureJSSelectors.renderAssetSelector(assetPanel, selectorProps);
}

export function getAssetsPlugin({ org, site }) {
  return {
    name: 'aem-assets',
    title: 'AEM Assets',
    experience: 'fullsize-dialog',
    ootb: false,
    sources: [],
    format: '',
    org,
    site,
  };
}
