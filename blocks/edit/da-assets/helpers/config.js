import { getFirstSheet, fetchDaConfigs } from '../../../shared/utils.js';
import DEFAULT_ASSET_BASE_PATH from './constants.js';

/**
 * Parses the value of 'aem.asset.mime.renditions' into a mime-type → rendition-type map.
 *
 * Format: comma-separated "mimetype:renditiontype" pairs.
 * Supports exact mime types and prefix wildcards:
 *   image/vnd.adobe.photoshop:avif   — exact match (wins over wildcards)
 *   image/*:original                 — all image/* as original
 *   video/*:original                 — all video/* as original
 *
 * @param {string|null} configValue  Raw config string, or null when not set.
 * @param {Record<string,string>} [defaults]  Base map to merge on top of; defaults to {}.
 * @returns {Record<string,string>}
 */
export function parseMimeRenditions(configValue, defaults = {}) {
  const map = { ...defaults };
  if (!configValue) return map;
  configValue.split(/\s*,\s*/).forEach((entry) => {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) return;
    const mime = entry.slice(0, colonIdx).trim().toLowerCase();
    const rendition = entry.slice(colonIdx + 1).trim().toLowerCase();
    if (mime && rendition) map[mime] = rendition;
  });
  return map;
}

export async function getResponsiveImageConfig(owner, repo) {
  if (!(repo || owner)) return null;
  const [orgConfig, siteConfig] = await Promise.all(
    fetchDaConfigs({ org: owner, site: repo }),
  );
  const responsiveImages = siteConfig?.['responsive-images'] || orgConfig?.['responsive-images'];
  if (!responsiveImages) return false;
  return responsiveImages.data.map((config) => ({
    ...config,
    crops: config.crops.split(/\s*,\s*/),
  }));
}

/**
 * Resolves the full repository configuration object from DA site config.
 *
 * tierType:
 *   'delivery' — repositoryId starts with 'delivery-'; uses DM Open API, no folder structure.
 *   'author'   — repositoryId starts with 'author-'; folder structure visible.
 *
 * assetOrigin: the host used to build final inserted asset URLs.
 *   1. aem.assets.prod.origin if set
 *   2. delivery tier: repositoryId is already the delivery host
 *   3. author + DM enabled: replace 'author' with 'delivery' in repositoryId
 *   4. author + no DM: replace 'author' with 'publish' in repositoryId
 *
 * rendition behaviour (DM / delivery tiers only):
 *   aem.asset.mime.renditions — optional comma-separated "mimetype:renditiontype" pairs.
 *   Supports exact mime types and prefix wildcards:
 *     image/vnd.adobe.photoshop:avif   — serve PSD as avif
 *     image/*:original                 — serve all images as original instead of avif
 *     video/*:original                 — serve all videos as original instead of /play
 *   When absent (or empty), built-in prefix defaults apply:
 *     image/* → avif, video/* → /play, everything else → original.
 *
 * @returns {{ repositoryId, tierType, assetOrigin, assetBasePath, isDmEnabled, isSmartCrop,
 *             insertAsLink, mimeRenditionOverrides }}
 */
export async function getRepositoryConfig(owner, repo) {
  const configs = await Promise.all(fetchDaConfigs({ org: owner, site: repo }));
  const entries = configs.reverse().flatMap((config) => getFirstSheet(config) || []);
  const getValue = (key) => entries.find((conf) => conf.key === key)?.value || null;

  const repositoryId = getValue('aem.repositoryId');
  if (!repositoryId) return null;

  const tierType = repositoryId.startsWith('delivery') ? 'delivery' : 'author';

  const customOrigin = getValue('aem.assets.prod.origin');
  const customBasePath = getValue('aem.assets.prod.basepath');
  const isSmartCrop = getValue('aem.asset.smartcrop.select') === 'on';
  const isDmDeliveryFlag = getValue('aem.asset.dm.delivery') === 'on';
  const isDmEnabled = isSmartCrop || isDmDeliveryFlag || customOrigin?.startsWith('delivery-') || tierType === 'delivery';
  const insertAsLink = getValue('aem.assets.image.type') === 'link';
  const mimeRenditionOverrides = parseMimeRenditions(getValue('aem.asset.mime.renditions'));

  let assetOrigin;
  if (customOrigin) {
    assetOrigin = customOrigin;
  } else if (tierType === 'delivery') {
    assetOrigin = repositoryId;
  } else if (isDmEnabled) {
    assetOrigin = repositoryId.replace('author', 'delivery');
  } else {
    assetOrigin = repositoryId.replace('author', 'publish');
  }

  const assetBasePath = customBasePath || DEFAULT_ASSET_BASE_PATH;

  return {
    repositoryId,
    tierType,
    assetOrigin,
    assetBasePath,
    isDmEnabled,
    isSmartCrop,
    insertAsLink,
    mimeRenditionOverrides,
  };
}
