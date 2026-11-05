import { getFileItemHref } from '../shared/da-file-item/navigation.js';

export function getBrowseHref({ path = '', href = window.location.href }) {
  const url = new URL(href);
  url.searchParams.set('landing', 'home');
  url.searchParams.set('browse', '2');
  url.hash = path ? `#${path}` : '';
  return url.href;
}

export function getFileHref({ item, href = window.location.href, editor = '/edit#' }) {
  if (!item.ext || item.ext === 'link') {
    const path = item.ext ? item.path.slice(0, item.path.lastIndexOf('/')) : item.path;
    return getBrowseHref({ path, href });
  }
  const url = new URL(getFileItemHref({ ...item, editor }), href);
  const current = new URL(href);
  if (url.origin !== current.origin) return url.href;
  ['nx', 'nxver', 'quick-edit', 'ew', 'nx-chat-ao', 'theme', 'rum'].forEach((key) => {
    if (current.searchParams.has(key)) url.searchParams.set(key, current.searchParams.get(key));
  });
  url.searchParams.set('landing', 'home');
  return url.href;
}
