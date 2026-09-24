/* eslint-disable no-underscore-dangle -- AEM response fields use underscored names. */
import { getDmApprovalStatus, getScene7PublishStatus } from '../../edit/da-assets/helpers/urls.js';

const RENDITION_REL = 'http://ns.adobe.com/adobecloud/rel/rendition';
const METADATA_REL = 'http://ns.adobe.com/adobecloud/rel/metadata/asset';
const SEARCH_PATH = '/adobe/repository/;api=search';
const NEXT_SEARCH_PATH = /^\/adobe\/repository\/(?:content\/dam(?:\/[^;]*)?)?;(?:t=\d+;)?api=search$/;

export function repositoryOrigin(config) {
  const { repositoryId, tierType } = config || {};
  if (typeof repositoryId !== 'string'
    || !/^(author|delivery)-[a-z0-9]+(?:-[a-z0-9]+)*\.adobeaemcloud\.com$/.test(repositoryId)) {
    throw new Error('Invalid AEM Assets repository host.');
  }
  if (tierType !== 'author') {
    throw new Error('Listing assets from a delivery-tier repository is not supported.');
  }
  if (!repositoryId.startsWith('author-')) throw new Error('Invalid AEM Assets author repository.');
  return `https://${repositoryId}`;
}

function safeUrl(href, origin, paths) {
  if (typeof href !== 'string') return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || url.protocol !== 'https:' || url.username || url.password
      || !paths.some((path) => url.pathname.startsWith(path))) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isImage(asset) {
  if (typeof asset.mimetype !== 'string' || !asset.mimetype.toLowerCase().startsWith('image/')) return false;
  if (typeof asset.path !== 'string' || !asset.path.startsWith('/content/dam/')
    || typeof asset.name !== 'string' || !asset.name || !asset['aem:formatName']) return false;
  return true;
}

function eligible(asset, config) {
  if (!isImage(asset)) return false;
  if (config.isDmEnabled) {
    const { status, activationTarget } = getDmApprovalStatus(asset);
    return status === 'approved' && (!activationTarget || activationTarget === 'delivery')
      && !!asset['repo:id'];
  }
  const publishStatus = getScene7PublishStatus(asset);
  return !publishStatus || publishStatus === 'PublishComplete';
}

function thumbnailLink(asset, origin) {
  const renditions = asset._links?.[RENDITION_REL];
  if (!Array.isArray(renditions)) return null;
  const ranked = renditions.map((rendition) => ({
    href: safeUrl(rendition?.href, origin, ['/adobe/repository/', '/content/dam/']),
    name: `${rendition?.name || ''} ${rendition?.href || ''}`,
  })).filter(({ href }) => href);
  return (ranked.find(({ name }) => /(?:^|[^0-9])140(?:x|%20|[^0-9])100(?:[^0-9]|$)/i.test(name))
    || ranked.find(({ name }) => /(?:^|[^0-9])319(?:x|%20|[^0-9])319(?:[^0-9]|$)/i.test(name))
    || ranked[0])?.href || null;
}

async function authenticatedFetch(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
  });
  if (!response.ok) {
    let reason = '';
    try {
      const body = await response.text();
      try {
        const data = JSON.parse(body);
        const message = data?.message || data?.error_description
          || data?.error?.message || data?.errors?.[0]?.message || data?.error;
        reason = typeof message === 'string' ? message : body;
      } catch {
        reason = body.replace(/<[^>]*>/g, ' ').trim();
      }
    } catch {
      // A failed response may not have a readable body.
    }
    const detail = typeof reason === 'string' ? reason.replaceAll(token, '[redacted]').slice(0, 240) : '';
    throw new Error(`AEM Assets request failed (${response.status})${detail ? `: ${detail}` : ''}.`);
  }
  return response;
}

/**
 * One listing per connected plugin. The host owns the pagination cursor and
 * the approved assets; neither URLs nor insertion properties come from the iframe.
 */
export function createAssetListing(config) {
  const origin = repositoryOrigin(config);
  const firstUrl = `${origin}${SEARCH_PATH}?path=%2Fcontent%2Fdam&assetType=file&limit=24`;
  let nextUrl = null;
  let started = false;
  const listedAssets = new Map();
  const files = new Map();

  return {
    getFile(id) {
      return files.get(id)?.file;
    },
    async prepareFile(id, token) {
      const asset = listedAssets.get(id);
      if (!asset) throw new Error('The image is not in the asset list.');
      if (!token) throw new Error('Sign in to Experience Workspace to drag images.');
      if (!files.has(id)) {
        const encodedPath = asset.path.split('/').map(encodeURIComponent).join('/');
        const url = safeUrl(encodedPath, origin, ['/content/dam/']);
        if (!url || new URL(url).pathname !== encodedPath) {
          throw new Error('Invalid AEM image path.');
        }
        const pending = { file: null };
        pending.promise = (async () => {
          const blob = await (await authenticatedFetch(url, token)).blob();
          if (!blob.size || !blob.type.startsWith('image/')) {
            throw new Error('AEM Assets did not return an image file.');
          }
          pending.file = new File([blob], asset.name, { type: blob.type });
          return pending.file;
        })().catch((error) => {
          if (files.get(id) === pending) files.delete(id);
          throw error;
        });
        files.set(id, pending);
      }
      return files.get(id).promise;
    },
    async load({ more = false, token }) {
      if (!token) throw new Error('Sign in to Experience Workspace to browse assets.');
      if (more && !started) throw new Error('Request the first asset page before loading more.');
      if (more && !nextUrl) return { assets: [], hasMore: false };
      const url = more ? nextUrl : firstUrl;
      const response = await authenticatedFetch(url, token);
      const data = await response.json();
      if (!Array.isArray(data?.children)) throw new Error('Invalid AEM Assets search response.');
      const nextHref = data._links?.next?.href;
      const next = nextHref ? safeUrl(nextHref, origin, ['/adobe/repository/']) : null;
      if (nextHref && (!next || !NEXT_SEARCH_PATH.test(new URL(next).pathname))) {
        throw new Error('Invalid AEM Assets pagination URL.');
      }
      const assets = await Promise.all(data.children.map(async (raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const asset = {
          ...raw,
          path: raw['repo:path'],
          name: raw['repo:name'],
          mimetype: raw['dc:format'],
        };
        if (!isImage(asset)) return null;
        // Search results omit embedded metadata. Require a same-origin metadata
        // link instead of silently treating every DM image as unapproved.
        if (config.isDmEnabled && !asset._embedded?.[METADATA_REL]) {
          const metadataHref = safeUrl(asset._links?.[METADATA_REL]?.href, origin, ['/adobe/repository/']);
          if (!metadataHref) {
            throw new Error('Cannot verify AEM asset approval: author search omitted asset metadata and its link.');
          }
          const metadata = await (await authenticatedFetch(metadataHref, token)).json();
          asset._embedded = { ...asset._embedded, [METADATA_REL]: metadata };
        }
        if (!eligible(asset, config)) return null;
        let thumbnail = null;
        const thumbUrl = thumbnailLink(asset, origin);
        if (thumbUrl) {
          try {
            thumbnail = await (await authenticatedFetch(thumbUrl, token)).blob();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('Could not load AEM asset thumbnail:', error);
          }
        }
        return { asset, thumbnail, name: asset.name };
      }));
      const listed = assets.filter(Boolean);
      if (!more) {
        listedAssets.clear();
        files.clear();
      }
      listed.forEach(({ asset }) => listedAssets.set(asset['repo:id'] || asset.path, asset));
      nextUrl = next;
      started = true;
      return { assets: listed, hasMore: !!next };
    },
  };
}
