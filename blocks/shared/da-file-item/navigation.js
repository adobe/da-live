import getEditPath from './edit-path.js';
import { getNx2Api } from '../../../scripts/utils.js';
import { pathMatchesActiveBranch } from '../branch-selector/context.js';

// Explicit openability: items whose capabilities forbid opening never get a generated editor link.
export function isFileItemOpenable({ capabilities } = {}) {
  return !capabilities || capabilities.canOpen !== false;
}

export function getFileItemHref({ path, ext, editor }) {
  if (ext !== 'link') return ext ? getEditPath({ path, ext, editor }) : `#${path}`;
  if (!pathMatchesActiveBranch(path)) return Promise.reject(new Error('Branch context does not match the URL'));
  return getNx2Api().then(async ({ source }) => {
    const response = await source.get(path);
    if (!response.ok) throw new Error(`Link request failed (${response.status})`);
    const { externalUrl } = await response.json();
    if (!externalUrl) throw new Error('Link has no destination');
    return externalUrl;
  });
}
