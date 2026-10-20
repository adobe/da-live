import getEditPath from '../../shared.js';
import { getNx2Api, getHomeHref } from '../../../../scripts/utils.js';

export function getBrowseItemHref({ path, ext, editor }) {
  if (ext !== 'link') {
    const href = ext ? getEditPath({ path, ext, editor }) : `#${path}`;
    if (!ext || !getHomeHref()) return href;
    const currentUrl = new URL(window.location.href);
    const url = new URL(href, currentUrl);
    if (url.origin !== currentUrl.origin) return href;
    url.searchParams.set('landing', 'home');
    ['nx', 'quick-edit', 'ew', 'nx-chat-ao', 'theme'].forEach((key) => {
      if (currentUrl.searchParams.has(key)) {
        url.searchParams.set(key, currentUrl.searchParams.get(key));
      }
    });
    return url.href;
  }
  return getNx2Api().then(async ({ source }) => {
    const response = await source.get(path);
    if (!response.ok) throw new Error(`Link request failed (${response.status})`);
    const { externalUrl } = await response.json();
    if (!externalUrl) throw new Error('Link has no destination');
    return externalUrl;
  });
}
