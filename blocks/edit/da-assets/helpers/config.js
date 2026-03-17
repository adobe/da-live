import { DA_ORIGIN } from '../../../shared/constants.js';
import { daFetch, getFirstSheet } from '../../../shared/utils.js';
import DEFAULT_ASSET_BASE_PATH from './constants.js';

const fullConfJsons = {};
const CONFS = {};

async function fetchConf(path) {
  if (CONFS[path]) return CONFS[path];
  const resp = await daFetch(`${DA_ORIGIN}/config${path}`);
  if (!resp.ok) return null;

  fullConfJsons[path] = await resp.json();
  const data = getFirstSheet(fullConfJsons[path]);
  if (!data) return null;
  CONFS[path] = data;
  return data;
}

async function fetchValue(path, key) {
  if (CONFS[path]?.[key]) return CONFS[path][key];

  const data = await fetchConf(path);
  if (!data) return null;

  const confKey = data.find((conf) => conf.key === key);
  if (!confKey) return null;
  return confKey.value;
}

function constructConfigPaths(owner, repo) {
  return [`/${owner}/${repo}/`, `/${owner}/`];
}

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

export async function getConfKey(owner, repo, key) {
  if (!(repo || owner)) return null;
  for (const path of constructConfigPaths(owner, repo)) {
    // eslint-disable-next-line no-await-in-loop
    const value = await fetchValue(path, key);
    if (value) return value;
  }
  return null;
}

export async function getResponsiveImageConfig(owner, repo) {
  if (!(repo || owner)) return null;
  for (const path of constructConfigPaths(owner, repo)) {
    // eslint-disable-next-line no-await-in-loop
    if (!fullConfJsons[path]) await fetchConf(path);
    const fullConfigJson = fullConfJsons[path];
    const responsiveImages = fullConfigJson?.['responsive-images'];
    if (responsiveImages) {
      return responsiveImages.data.map((config) => ({
        ...config,
        crops: config.crops.split(/\s*,\s*/),
      }));
    }
  }
  return false;
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
  const repositoryId = await getConfKey(owner, repo, 'aem.repositoryId');
  if (!repositoryId) return null;

  const tierType = repositoryId.startsWith('delivery') ? 'delivery' : 'author';

  const customOrigin = await getConfKey(owner, repo, 'aem.assets.prod.origin');
  const customBasePath = await getConfKey(owner, repo, 'aem.assets.prod.basepath');
  const isSmartCrop = (await getConfKey(owner, repo, 'aem.asset.smartcrop.select')) === 'on';
  const isDmDeliveryFlag = (await getConfKey(owner, repo, 'aem.asset.dm.delivery')) === 'on';
  const isDmEnabled = isSmartCrop || isDmDeliveryFlag || customOrigin?.startsWith('delivery-') || tierType === 'delivery';
  const insertAsLink = (await getConfKey(owner, repo, 'aem.assets.image.type')) === 'link';
  const mimeRenditionsConfig = await getConfKey(owner, repo, 'aem.asset.mime.renditions');
  const mimeRenditionOverrides = parseMimeRenditions(mimeRenditionsConfig);

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
