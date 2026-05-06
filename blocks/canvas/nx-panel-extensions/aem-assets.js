/* eslint-disable import/no-unresolved -- importmap */
import { DOMParser as PMDOMParser } from 'da-y-wrapper';
import { getNx, fetchDaConfigs, getFirstSheet } from '../../shared/nxutils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/static-assets/resources/assets-selectors.js';
const DEFAULT_BASE_PATH = '/adobe/assets';

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

async function getRepositoryConfig(org, site) {
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
  const isDmEnabled = getValue('aem.asset.dm.delivery') === 'on'
    || getValue('aem.asset.smartcrop.select') === 'on'
    || tierType === 'delivery';

  let assetOrigin;
  if (customOrigin) assetOrigin = customOrigin;
  else if (tierType === 'delivery') assetOrigin = repositoryId;
  else if (isDmEnabled) assetOrigin = repositoryId.replace('author', 'delivery');
  else assetOrigin = repositoryId.replace('author', 'publish');

  const assetBasePath = getValue('aem.assets.prod.basepath') || DEFAULT_BASE_PATH;

  return { repositoryId, tierType, assetOrigin, assetBasePath, isDmEnabled };
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

function resolveAssetUrl(asset, config) {
  const { tierType, assetOrigin, assetBasePath, isDmEnabled } = config;
  if (tierType === 'delivery') return buildDeliveryUrl(asset, assetOrigin, assetBasePath);
  if (isDmEnabled) return buildDmUrl(asset, assetOrigin, assetBasePath);
  return buildAuthorUrl(asset, assetOrigin);
}

// ---------------------------------------------------------------------------
// Insertion
// ---------------------------------------------------------------------------

function insertImage(view, src, alt) {
  const attrs = { src, style: 'width: 180px' };
  if (alt) attrs.alt = alt;
  const node = view.state.schema.nodes.image.create(attrs);
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}

function insertLink(view, src) {
  const para = document.createElement('p');
  const link = document.createElement('a');
  link.href = src;
  link.innerText = src;
  para.append(link);
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(para);
  view.dispatch(view.state.tr.replaceSelectionWith(parsed).scrollIntoView());
}

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

  const selectorProps = {
    imsToken: token,
    repositoryId: repoConfig.repositoryId,
    aemTierType: repoConfig.tierType,
    featureSet: ['upload', 'collections', 'detail-panel', 'advisor'],
    ...(onClose && { onClose }),
    handleSelection: (assets) => {
      const [asset] = assets;
      if (!asset) return;
      const { view } = getExtensionsBridge();
      if (!view) return;
      const src = resolveAssetUrl(asset, repoConfig);
      const mimetype = (asset.mimetype || asset['dc:format'] || '').toLowerCase();
      const alt = getAssetAlt(asset);
      if (mimetype.startsWith('image/')) {
        insertImage(view, src, alt);
      } else {
        insertLink(view, src);
      }
    },
  };

  window.PureJSSelectors.renderAssetSelector(container, selectorProps);
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
