import { getFileItemHref } from '../shared/da-file-item/navigation.js';
import { getConfiguredEditor } from '../shared/da-file-item/edit-path.js';

const METADATA_CONCURRENCY = 4;
const CREATE_PAGE = /^\/?\{action:create-page\}$/;

export function getBrowseHref({ path = '', href = window.location.href }) {
  const url = new URL(href);
  url.searchParams.set('landing', 'home');
  url.searchParams.set('browse', '2');
  url.hash = path ? `#${path}` : '';
  return url.href;
}

export function getFileHref({ item, href = window.location.href, editor = '/edit#' }) {
  if (item.ext === 'link') return getFileItemHref(item);
  if (!item.ext) return getBrowseHref({ path: item.path, href });
  const url = new URL(getFileItemHref({ ...item, editor }), href);
  const current = new URL(href);
  if (url.origin !== current.origin) return url.href;
  ['nx', 'nxver', 'quick-edit', 'ew', 'nx-chat-ao', 'theme', 'rum'].forEach((key) => {
    if (current.searchParams.has(key)) url.searchParams.set(key, current.searchParams.get(key));
  });
  url.searchParams.set('landing', 'home');
  return url.href;
}

export function getListItems({ files, favorites, editor = '/edit#', editorConfs }) {
  return files.map((item) => ({
    ...item,
    href: getFileHref({
      item,
      editor: getConfiguredEditor(item.path, editorConfs, editor),
    }),
    folderHref: getBrowseHref({ path: item.path.slice(0, item.path.lastIndexOf('/')) }),
    imagePreview: false,
    isFavorited: favorites?.has(item.path) ?? false,
  }));
}

export async function loadFilesByPath({ paths, source, signal }) {
  const files = [];
  for (let offset = 0; offset < paths.length; offset += METADATA_CONCURRENCY) {
    const batch = await Promise.all(paths.slice(offset, offset + METADATA_CONCURRENCY)
      .map(async (path) => {
        signal.throwIfAborted();
        const filename = path.slice(path.lastIndexOf('/') + 1);
        const dot = filename.lastIndexOf('.');
        const ext = dot > 0 ? filename.slice(dot + 1) : undefined;
        const item = { path, name: ext ? filename.slice(0, dot) : filename, ext };
        if (!item.ext) return item;
        try {
          const response = await source.getMetadata(path);
          signal.throwIfAborted();
          if (!response.ok) return undefined;
          const lastModified = Date.parse(response.headers.get('last-modified'));
          return {
            ...item,
            lastModified: Number.isNaN(lastModified) ? undefined : lastModified,
          };
        } catch (error) {
          signal.throwIfAborted();
          if (error?.name === 'AbortError') throw error;
          return undefined;
        }
      }));
    files.push(...batch.filter(Boolean));
  }
  return files;
}

export function getTileTarget({ entry, scope, href = window.location.href }) {
  try {
    const template = entry.href.replace(/%7B.*?%7D/gi, (token) => decodeURIComponent(token));
    const [org, site] = scope?.split('/') || [];
    if (CREATE_PAGE.test(template)) return { action: 'create-page', disabled: !org || !site };
    const requiresSite = /\{org\}|\{site\}/.test(template);
    if (requiresSite && (!org || !site)) return { disabled: true };
    const target = template.replace(/\{org\}/g, encodeURIComponent(org))
      .replace(/\{site\}/g, encodeURIComponent(site));
    if (/[{}]|%7B|%7D/i.test(target)) return { disabled: true };
    const url = new URL(target, entry.baseHref || href);
    if (!['http:', 'https:'].includes(url.protocol)) return { disabled: true };
    const current = new URL(href);
    const sameOrigin = url.origin === current.origin;
    if (requiresSite && !sameOrigin) return { disabled: true };
    if (sameOrigin) {
      ['nx', 'nxver', 'quick-edit', 'ew', 'nx-chat-ao', 'rum'].forEach((key) => {
        if (current.searchParams.has(key) && !url.searchParams.has(key)) {
          url.searchParams.set(key, current.searchParams.get(key));
        }
      });
    }
    return { href: url.href, disabled: false };
  } catch {
    return { disabled: true };
  }
}
