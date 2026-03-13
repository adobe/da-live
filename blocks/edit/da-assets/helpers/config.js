import { DA_ORIGIN } from '../../../shared/constants.js';
import { daFetch, getFirstSheet } from '../../../shared/utils.js';

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
 * @returns {{ repositoryId, tierType, assetOrigin, isDmEnabled, isSmartCrop, insertAsLink }}
 */
export async function getRepositoryConfig(owner, repo) {
  const repositoryId = await getConfKey(owner, repo, 'aem.repositoryId');
  if (!repositoryId) return null;

  const tierType = repositoryId.startsWith('delivery') ? 'delivery' : 'author';

  const customOrigin = await getConfKey(owner, repo, 'aem.assets.prod.origin');
  const isSmartCrop = (await getConfKey(owner, repo, 'aem.asset.smartcrop.select')) === 'on';
  const isDmDeliveryFlag = (await getConfKey(owner, repo, 'aem.asset.dm.delivery')) === 'on';
  const isDmEnabled = isSmartCrop || isDmDeliveryFlag || customOrigin?.startsWith('delivery-') || tierType === 'delivery';
  const insertAsLink = (await getConfKey(owner, repo, 'aem.assets.image.type')) === 'link';

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

  return {
    repositoryId,
    tierType,
    assetOrigin,
    isDmEnabled,
    isSmartCrop,
    insertAsLink,
  };
}
