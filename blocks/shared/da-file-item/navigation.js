import getEditPath from './edit-path.js';
import { getNx2Api } from '../../../scripts/utils.js';
import { pathMatchesActiveBranch } from '../branch-selector/context.js';

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
