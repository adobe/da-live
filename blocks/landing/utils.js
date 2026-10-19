import { getBrowseItemHref } from '../browse/v2/shared/navigation.js';
import { iconPathForExt, isImageExt } from '../shared/icons.js';

export async function fetchFileModifier({ path, source }) {
  const response = await source.getMetadata(path);
  if (!response?.ok) return { error: `Could not load the modifier (${response?.status || 'no response'}).` };
  const name = response.headers.get('x-last-modified-by');
  return name ? { name: name.split('@')[0] } : { error: 'The source did not provide a modifier.' };
}

export function getLandingIconHref(item) {
  const type = item.type === 'content-fragment' || item.type === 'fragment' ? 'fragment'
    : { html: 'page', json: 'sheet', csv: 'sheet', xlsx: 'sheet' }[item.ext];
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

export function getSiteOptions({ recentSites, current }) {
  const sites = [...new Set([current, ...recentSites].filter(
    (site) => typeof site === 'string' && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(site),
  ))];
  return sites.map((value) => {
    const [org, site] = value.split('/');
    return { value, label: `${site} (${org})` };
  });
}

export function getBrowseHref({ path = '', href = window.location.href }) {
  const url = new URL(href);
  url.searchParams.delete('landing');
  url.searchParams.set('browse', '2');
  url.hash = path ? `#${path}` : '';
  return url.href;
}

export function getFileHref({ item, href = window.location.href, editor = '/canvas#' }) {
  if (!item.ext || item.ext === 'link') {
    const path = item.ext ? item.path.slice(0, item.path.lastIndexOf('/')) : item.path;
    return getBrowseHref({ path, href });
  }
  const url = new URL(getBrowseItemHref({ ...item, editor }), href);
  const current = new URL(href);
  ['nx', 'quick-edit', 'ew', 'nx-chat-ao'].forEach((key) => {
    if (current.searchParams.has(key)) url.searchParams.set(key, current.searchParams.get(key));
  });
  return url.href;
}

export async function loadFiles({ path, source, signal }) {
  const items = new Map();
  const tokens = new Set();
  let continuationToken;
  do {
    signal.throwIfAborted();
    const result = await source.list(path, { continuationToken });
    signal.throwIfAborted();
    if (!result.ok) throw new Error('Could not load files. Check your sign-in and site permissions.');
    result.items.forEach((item) => {
      if (item.path && item.name && !item.name.startsWith('.')) items.set(item.path, item);
    });
    continuationToken = result.continuationToken;
    if (continuationToken && tokens.has(continuationToken)) {
      throw new Error('File listing did not complete. Please try again.');
    }
    tokens.add(continuationToken);
  } while (continuationToken);
  return [...items.values()].sort(
    (a, b) => (Number(b.lastModified) || 0) - (Number(a.lastModified) || 0)
      || a.name.localeCompare(b.name),
  );
}
