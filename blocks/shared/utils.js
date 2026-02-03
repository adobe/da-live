import { DA_ORIGIN } from './constants.js';

const { getNx } = await import('../../scripts/utils.js');

// TODO: INFRA
const DA_ORIGINS = ['https://da.live', 'https://da.page', 'https://admin.da.live', 'https://admin.da.page', 'https://stage-admin.da.live', 'https://content.da.live', 'https://stage-content.da.live', 'http://localhost:8787'];
const AEM_ORIGINS = ['https://admin.hlx.page', 'https://admin.aem.live'];
const ALLOWED_TOKEN = [...DA_ORIGINS, ...AEM_ORIGINS];

let imsDetails;

export async function initIms() {
  if (imsDetails) return imsDetails;
  const { loadIms } = await import(`${getNx()}/utils/ims.js`);

  try {
    imsDetails = await loadIms();
    return imsDetails;
  } catch {
    return null;
  }
}

export const daFetch = async (url, opts = {}) => {
  opts.headers = opts.headers || {};
  let accessToken;
  if (localStorage.getItem('nx-ims')) {
    ({ accessToken } = await initIms());
    const canToken = ALLOWED_TOKEN.some((origin) => new URL(url).origin === origin);
    if (accessToken && canToken) {
      opts.headers.Authorization = `Bearer ${accessToken.token}`;
      if (AEM_ORIGINS.some((origin) => new URL(url).origin === origin)) {
        opts.headers['x-content-source-authorization'] = `Bearer ${accessToken.token}`;
      }
    }
  }
  const resp = await fetch(url, opts);
  if (resp.status === 401 && opts.noRedirect !== true) {
    // Only attempt sign-in if the request is for DA.
    if (DA_ORIGINS.some((origin) => url.startsWith(origin))) {
      // If the user has an access token, but are not permitted, redirect them to not found.
      if (accessToken) {
        // eslint-disable-next-line no-console
        console.warn('You see the 404 page because you have no access to this page', url);
        window.location = `${window.location.origin}/not-found`;
        return { ok: false };
      }
      // eslint-disable-next-line no-console
      console.warn('You need to sign in because you are not authorized to access this page', url);
      const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
      await loadIms();
      handleSignIn();
    }
  }

  // TODO: Properly support 403 - DA Admin sometimes gives 401s and sometimes 403s.
  if (resp.status === 403) {
    return resp;
  }

  // If child actions header is present, use it.
  // This is a hint as to what can be done with the children.
  if (resp.headers?.get('x-da-child-actions')) {
    resp.permissions = resp.headers.get('x-da-child-actions').split('=').pop().split(',');
    return resp;
  }

  // Use the self actions hint if child actions are not present.
  if (resp.headers?.get('x-da-actions')) {
    resp.permissions = resp.headers?.get('x-da-actions')?.split('=').pop().split(',');
    return resp;
  }

  // Support legacy admin.role.all
  resp.permissions = ['read', 'write'];
  return resp;
};

export async function aemAdmin(path, api, method = 'POST') {
  const [owner, repo, ...parts] = path.slice(1).split('/');
  const name = parts.pop() || repo || owner;
  parts.push(name.replace('.html', ''));
  const aemUrl = `https://admin.hlx.page/${api}/${owner}/${repo}/main/${parts.join('/')}`;
  const resp = await daFetch(aemUrl, { method });
  if (method === 'DELETE' && resp.status === 204) return {};
  if (!resp.ok) return undefined;
  try {
    return resp.json();
  } catch {
    return undefined;
  }
}

export async function saveToDa({ path, formData, blob, props, preview = false }) {
  const opts = { method: 'PUT' };

  const form = formData || new FormData();
  if (blob || props) {
    if (blob) form.append('data', blob);
    if (props) form.append('props', JSON.stringify(props));
  }
  if ([...form.keys()].length) opts.body = form;

  const daResp = await daFetch(`${DA_ORIGIN}/source${path}`, opts);
  if (!daResp.ok) return undefined;
  if (!preview) return undefined;
  return aemAdmin(path, 'preview');
}

export const getSheetByIndex = (json, index = 0) => {
  if (json[':type'] !== 'multi-sheet') {
    return json.data;
  }
  return json[Object.keys(json)[index]]?.data;
};

export const getFirstSheet = (json) => getSheetByIndex(json, 0);

/**
 * Authenticated Image Loader for Local Development
 * 
 * In production, images are served via content.da.live (public CDN).
 * In local dev, images need authenticated loading because:
 * - Browser img requests don't include IMS token
 * - da-admin requires authentication for /source/ paths
 * 
 * This function observes an element for broken images and reloads them
 * via authenticated fetch, replacing the src with blob URLs.
 * 
 * IMPORTANT: Only active in local dev (localhost). Production behavior unchanged.
 */
export function initLocalDevImageLoader(containerElement, orgRepo) {
  // Only activate in local development
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocalDev) {
    console.log('[DA] Production mode - using standard image loading');
    return () => {}; // No-op cleanup
  }

  console.log('[DA] Local dev mode - enabling authenticated image loading');
  
  // Track which images we've already processed
  const processedImages = new WeakSet();
  
  async function loadImageAuthenticated(img) {
    if (processedImages.has(img)) return;
    processedImages.add(img);
    
    const originalSrc = img.getAttribute('src') || img.getAttribute('srcset');
    if (!originalSrc) return;
    
    // Skip if already a blob URL or data URL or external URL (not our origin)
    if (originalSrc.startsWith('blob:') || originalSrc.startsWith('data:')) {
      return;
    }
    
    // Skip external URLs (not on localhost)
    if (originalSrc.startsWith('http') && !originalSrc.includes('localhost')) {
      return;
    }
    
    // Construct the authenticated URL
    let sourcePath;
    if (originalSrc.startsWith('/source/')) {
      // Already a /source/ path - use directly
      sourcePath = `${DA_ORIGIN}${originalSrc}`;
    } else if (originalSrc.startsWith('http://localhost')) {
      // Full localhost URL
      sourcePath = originalSrc;
    } else {
      // Relative path - prepend /source/orgRepo/
      sourcePath = `${DA_ORIGIN}/source/${orgRepo}/${originalSrc}`;
    }
    
    console.log(`[DA] Loading image via auth: ${sourcePath}`);
    
    try {
      const response = await daFetch(sourcePath);
      if (!response.ok) {
        console.warn(`[DA] Image fetch failed: ${response.status} for ${sourcePath}`);
        return;
      }
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Replace the src
      if (img.tagName === 'SOURCE') {
        img.srcset = blobUrl;
      } else {
        img.src = blobUrl;
      }
      
      console.log(`[DA] Image loaded: ${originalSrc} -> blob`);
    } catch (err) {
      console.error(`[DA] Image load error:`, err);
    }
  }
  
  // Check if an image needs authenticated loading
  function needsAuthLoad(src) {
    if (!src) return false;
    if (src.startsWith('blob:') || src.startsWith('data:')) return false;
    // External URLs (not localhost) don't need auth
    if (src.startsWith('http') && !src.includes('localhost')) return false;
    // /source/ paths, localhost URLs, and relative paths all need auth
    return true;
  }

  // Handle broken images
  function handleImageError(event) {
    const img = event.target;
    if (img.tagName === 'IMG' || img.tagName === 'SOURCE') {
      loadImageAuthenticated(img);
    }
  }
  
  // Observe for new images
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const images = node.querySelectorAll?.('img, source') || [];
          images.forEach((img) => {
            const src = img.getAttribute('src') || img.getAttribute('srcset');
            if (needsAuthLoad(src)) {
              loadImageAuthenticated(img);
            }
          });
          if (node.tagName === 'IMG' || node.tagName === 'SOURCE') {
            const src = node.getAttribute('src') || node.getAttribute('srcset');
            if (needsAuthLoad(src)) {
              loadImageAuthenticated(node);
            }
          }
        }
      }
    }
  });
  
  // Start observing
  containerElement.addEventListener('error', handleImageError, true);
  observer.observe(containerElement, { childList: true, subtree: true });
  
  // Also process any existing images
  const existingImages = containerElement.querySelectorAll('img, source');
  existingImages.forEach((img) => {
    const src = img.getAttribute('src') || img.getAttribute('srcset');
    if (needsAuthLoad(src)) {
      loadImageAuthenticated(img);
    }
  });
  
  // Return cleanup function
  return () => {
    containerElement.removeEventListener('error', handleImageError, true);
    observer.disconnect();
  };
}
