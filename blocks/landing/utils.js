import { getFileItemHref } from '../shared/da-file-item/navigation.js';
import { iconPathForExt, isImageExt } from '../shared/icons.js';
import { getHomeHref } from '../../scripts/utils.js';
import { getCreateSiteHref as getSharedCreateSiteHref } from '../shared/site-access.js';

export async function fetchFileModifier({ path, source }) {
  const response = await source.getMetadata(path);
  if (!response?.ok) return { error: `Could not load the modifier (${response?.status || 'no response'}).` };
  const name = response.headers.get('x-last-modified-by');
  return name ? { name: name.split('@')[0] } : { error: 'The source did not provide a modifier.' };
}

export function getLandingIconHref(item) {
  const type = item.type === 'content-fragment' || item.type === 'fragment' ? 'fragment'
    : { html: 'page' }[item.ext];
  const name = type || (isImageExt(item.ext) ? 'image' : undefined);
  return name ? new URL(`./${name}.svg`, import.meta.url).href : iconPathForExt(item.ext);
}

export function formatModified({ modified, now = new Date() }) {
  const date = new Date(Number(modified));
  if (!(Number(modified) > 0) || Number.isNaN(date.getTime())) return undefined;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date >= today && date <= now) return { date, label: 'Today' };
  if (date >= yesterday && date < today) return { date, label: 'Yesterday' };
  return {
    date,
    label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }).format(date),
  };
}

export { getSiteOptions } from '../shared/site-picker-utils.js';

export { checkSiteAccess } from '../shared/site-access.js';

export function getBrowseHref({ path = '', href = window.location.href, closeChat = false }) {
  const url = new URL(href);
  if (getHomeHref({ href })) url.searchParams.set('landing', 'home');
  else url.searchParams.delete('landing');
  url.searchParams.set('browse', '2');
  if (closeChat) url.searchParams.set('chat', 'closed');
  url.hash = path ? `#${path}` : '';
  return url.href;
}

export function getCreateSiteHref({ org, href = window.location.href }) {
  return getSharedCreateSiteHref({ org, href: getBrowseHref({ href }) });
}

export function getFileHref({ item, href = window.location.href, editor = '/canvas#' }) {
  if (!item.ext || item.ext === 'link') {
    const path = item.ext ? item.path.slice(0, item.path.lastIndexOf('/')) : item.path;
    return getBrowseHref({ path, href });
  }
  const url = new URL(getFileItemHref({ ...item, editor }), href);
  const current = new URL(href);
  ['nx', 'quick-edit', 'ew', 'nx-chat-ao', 'theme', 'rum'].forEach((key) => {
    if (current.searchParams.has(key)) url.searchParams.set(key, current.searchParams.get(key));
  });
  if (getHomeHref({ href })) url.searchParams.set('landing', 'home');
  return url.href;
}

export async function loadFiles({ path, source, signal }) {
  const items = new Map();
  const tokens = new Set();
  let continuationToken;
  let permissions;
  do {
    signal.throwIfAborted();
    const result = await source.list(path, { continuationToken });
    signal.throwIfAborted();
    if (!result.ok) throw new Error('Could not load files. Check your sign-in and site permissions.');
    permissions ??= result.permissions;
    result.items.forEach((item) => {
      if (item.path && item.name && !item.name.startsWith('.')) items.set(item.path, item);
    });
    continuationToken = result.continuationToken;
    if (continuationToken && tokens.has(continuationToken)) {
      throw new Error('File listing did not complete. Please try again.');
    }
    tokens.add(continuationToken);
  } while (continuationToken);
  const files = [...items.values()].sort(
    (a, b) => (Number(b.lastModified) || 0) - (Number(a.lastModified) || 0)
      || a.name.localeCompare(b.name),
  );
  return { files, permissions };
}
