import { getFileItemHref } from '../shared/da-file-item/navigation.js';
import { getConfiguredEditor } from '../shared/da-file-item/edit-path.js';

const METADATA_CONCURRENCY = 4;

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
