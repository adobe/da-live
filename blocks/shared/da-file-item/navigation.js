import getEditPath from './edit-path.js';
import { getNx2Api } from '../../../scripts/utils.js';
import { pathMatchesActiveBranch } from '../branch-selector/context.js';
import { discoverDaRsCapabilities, siteItemCapabilities } from '../da-rs-provider.js';
import { isDaRsSelected } from '../da-rs-bootstrap.js';

// Explicit openability: items whose capabilities forbid opening never get a generated editor link.
export function isFileItemOpenable({ capabilities } = {}) {
  return !capabilities || capabilities.canOpen !== false;
}

export function getFileItemHref({ path, ext, editor, capabilities }) {
  if (ext !== 'link') return ext ? getEditPath({ path, ext, editor, capabilities }) : `#${path}`;
  if (!pathMatchesActiveBranch(path)) return Promise.reject(new Error('Branch context does not match the URL'));
  return getNx2Api().then(async ({ source }) => {
    const response = await source.get(path);
    if (!response.ok) throw new Error(`Link request failed (${response.status})`);
    const { externalUrl } = await response.json();
    if (!externalUrl) throw new Error('Link has no destination');
    return externalUrl;
  });
}

// Items without listing capabilities (search suggestions, recents) get the same imported-page
// routing as listed items; any discovery failure keeps the unchanged native routing.
export async function resolveFileItemHref(item) {
  const { path = '', ext, capabilities } = item;
  if (ext === 'html' && !capabilities && isDaRsSelected()) {
    const [, org, site] = path.split('/');
    if (org && site && !site.includes('~')) {
      try {
        const caps = await discoverDaRsCapabilities(org, site);
        if (caps?.contentProfile === 'aem-import') {
          return getFileItemHref({ ...item, capabilities: siteItemCapabilities(caps, 'page', []) });
        }
      } catch {
        // Fall through to native routing.
      }
    }
  }
  return getFileItemHref(item);
}
