import getEditPath from '../../shared.js';
import { getNx2Api } from '../../../../scripts/utils.js';

export function getBrowseItemHref({ path, ext, editor }) {
  if (ext !== 'link') return ext ? getEditPath({ path, ext, editor }) : `#${path}`;
  return getNx2Api().then(async ({ source }) => {
    const response = await source.get(path);
    if (!response.ok) throw new Error(`Link request failed (${response.status})`);
    const { externalUrl } = await response.json();
    if (!externalUrl) throw new Error('Link has no destination');
    return externalUrl;
  });
}
