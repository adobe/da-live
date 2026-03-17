import DEFAULT_ASSET_BASE_PATH from './constants.js';

const RENDITION_REL = 'http://ns.adobe.com/adobecloud/rel/rendition';

function resolveAssetBasePath(basePath = DEFAULT_ASSET_BASE_PATH) {
  const normalized = `/${basePath}`.replace(/^\/+/, '/').replace(/\/+$/, '');
  return normalized || DEFAULT_ASSET_BASE_PATH;
}

/**
 * Determines the DM rendition type for a given mime type.
 *
 * Precedence (highest → lowest):
 *   1. Exact mime-type entry in mimeRenditionOverrides (e.g. 'image/vnd.adobe.photoshop': 'avif').
 *   2. Prefix wildcard entry in mimeRenditionOverrides (e.g. 'image/*': 'original').
 *      Use this in site config to opt entire type groups back to original:
 *        aem.asset.mime.renditions = image/*:original, video/*:original
 *   3. Prefix defaults — image/* → 'avif', video/* → 'play'.
 *   4. Fallback — any unrecognised mime type → 'original'.
 *
 * @param {string} mimetype
 * @param {{ mimeRenditionOverrides?: Record<string,string> }} [options]
 * @returns {'avif'|'play'|'original'}
 */
export function resolveRenditionType(mimetype, { mimeRenditionOverrides = {} } = {}) {
  const lower = (mimetype || '').toLowerCase();

  // Exact match wins first.
  if (mimeRenditionOverrides[lower]) return mimeRenditionOverrides[lower];

  // Prefix wildcard (e.g. 'image/*': 'original') wins over the built-in prefix defaults.
  const prefix = lower.includes('/') ? `${lower.split('/')[0]}/*` : '';
  if (prefix && mimeRenditionOverrides[prefix]) return mimeRenditionOverrides[prefix];

  if (lower.startsWith('image/')) return 'avif';
  if (lower.startsWith('video/')) return 'play';

  return 'original';
}

/**
 * Author tier, no DM delivery.
 * Asset response includes asset.path and _links renditions.
 */
export function buildAuthorUrl(asset, publishOrigin) {
  const mimetype = asset.mimetype || asset['dc:format'] || '';
  if (mimetype.startsWith('video/')) {
    // eslint-disable-next-line no-underscore-dangle
    const renditionLinks = asset._links?.[RENDITION_REL];
    const videoLink = renditionLinks?.find((link) => link.href.endsWith('/play'))?.href;
    return videoLink || `https://${publishOrigin}${asset.path}`;
  }
  return `https://${publishOrigin}${asset.path}`;
}

/**
 * Author tier + DM delivery enabled.
 * Browses via author but constructs DM-style delivery URLs using repo:id.
 *
 * The rendition path is determined by resolveRenditionType() using mimeRenditionOverrides
 * from site config (aem.asset.mime.renditions). Built-in defaults when no override applies:
 *   image/* → https://<host>/<basePath>/<id>/as/<seo-name>.avif
 *   video/* → https://<host>/<basePath>/<id>/play
 *   other   → https://<host>/<basePath>/<id>/original/as/<name>
 *
 * @param {object} asset
 * @param {string} host
 * @param {string} [basePath]
 * @param {{ mimeRenditionOverrides?: Record<string,string> }} [renditionOptions]
 */
export function buildDmUrl(asset, host, basePath = DEFAULT_ASSET_BASE_PATH, renditionOptions = {}) {
  const mimetype = asset.mimetype || asset['dc:format'] || '';
  const base = `https://${host}${resolveAssetBasePath(basePath)}/${asset['repo:id']}`;
  const renditionType = resolveRenditionType(mimetype, renditionOptions);

  if (renditionType === 'avif') {
    const seoName = asset.name.includes('.')
      ? asset.name.split('.').slice(0, -1).join('.')
      : asset.name;
    return `${base}/as/${seoName}.avif`;
  }

  if (renditionType === 'play') {
    return `${base}/play`;
  }

  return `${base}/original/as/${asset.name}`;
}

/**
 * Delivery tier (DM Open API).
 * Asset response uses repo:assetId, repo:repositoryId, repo:name.
 * Folder structure is not available (flat listing).
 *
 * The rendition path is determined by resolveRenditionType() using mimeRenditionOverrides
 * from site config (aem.asset.mime.renditions). Built-in defaults when no override applies:
 *   image/* → https://<host>/<basePath>/<id>/as/<seo-name>.avif
 *   video/* → https://<host>/<basePath>/<id>/play
 *   other   → https://<host>/<basePath>/<id>/original/as/<name>
 *
 * @param {object} asset
 * @param {string} [overrideHost]
 * @param {string} [basePath]
 * @param {{ mimeRenditionOverrides?: Record<string,string> }} [renditionOptions]
 */
export function buildDeliveryUrl(
  asset,
  overrideHost,
  basePath = DEFAULT_ASSET_BASE_PATH,
  renditionOptions = {},
) {
  const host = overrideHost || asset['repo:repositoryId'];
  const assetId = asset['repo:assetId'];
  const fullName = asset['repo:name'] || '';
  const mimetype = asset.mimetype || asset['dc:format'] || '';
  const base = `https://${host}${resolveAssetBasePath(basePath)}/${assetId}`;
  const renditionType = resolveRenditionType(mimetype, renditionOptions);

  if (renditionType === 'avif') {
    // seoName is the filename without extension per the AEM Open API spec
    const seoName = fullName.includes('.')
      ? fullName.split('.').slice(0, -1).join('.')
      : fullName;
    return `${base}/as/${seoName}.avif`;
  }

  if (renditionType === 'play') {
    return `${base}/play`;
  }

  return `${base}/original/as/${fullName}`;
}

/**
 * Returns the smart crop URL for a given crop name.
 * Used when aem.asset.smartcrop.select is enabled.
 */
export function buildSmartCropUrl(asset, dmOrigin, cropName, basePath = DEFAULT_ASSET_BASE_PATH) {
  const base = `https://${dmOrigin}${resolveAssetBasePath(basePath)}/${asset['repo:id']}`;
  const seoName = asset.name.includes('.')
    ? asset.name.split('.').slice(0, -1).join('.')
    : asset.name;
  return `${base}/as/${cropName}-${seoName}.avif?smartcrop=${cropName}`;
}

/**
 * Returns the base DM URL for fetching smart crops list.
 */
export function buildSmartCropsListUrl(asset, dmOrigin, basePath = DEFAULT_ASSET_BASE_PATH) {
  return `https://${dmOrigin}${resolveAssetBasePath(basePath)}/${asset['repo:id']}/smartCrops`;
}

/**
 * Returns the alt text for an asset from the _embedded metadata (author tier).
 */
export function getAssetAlt(asset) {
  // eslint-disable-next-line no-underscore-dangle
  const meta = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset'];
  return meta?.['dc:description'] || meta?.['dc:title'] || '';
}

/**
 * Returns the DM asset approval status from author-tier _embedded metadata.
 * Used to block insertion of unapproved assets when DM delivery is enabled.
 */
export function getDmApprovalStatus(asset) {
  // eslint-disable-next-line no-underscore-dangle
  const meta = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset'];
  return {
    status: meta?.['dam:assetStatus'],
    activationTarget: meta?.['dam:activationTarget'],
  };
}
