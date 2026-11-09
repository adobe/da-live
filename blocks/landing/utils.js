import { getFileItemHref } from '../shared/da-file-item/navigation.js';
import { getConfiguredEditor } from '../shared/da-file-item/edit-path.js';

const LIST_CONCURRENCY = 4;

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
  const found = new Map();
  const parentOf = (path) => path.slice(0, path.lastIndexOf('/'));
  const loadFolder = async (folder) => {
    const wanted = paths.filter((path) => parentOf(path) === folder);
    const tokens = new Set();
    let continuationToken;
    do {
      signal.throwIfAborted();
      const result = await source.list(folder, { continuationToken, opts: { signal } });
      signal.throwIfAborted();
      if (!result.ok) throw new Error('Could not load files. Check your sign-in and site permissions.');
      result.items.forEach((item) => {
        if (wanted.includes(item.path)) found.set(item.path, item);
      });
      continuationToken = result.continuationToken;
      if (continuationToken && tokens.has(continuationToken)) {
        throw new Error('File listing did not complete. Please try again.');
      }
      tokens.add(continuationToken);
    } while (continuationToken && wanted.some((path) => !found.has(path)));
  };
  const folders = [...new Set(paths.map(parentOf))];
  while (folders.length) {
    await Promise.all(folders.splice(0, LIST_CONCURRENCY).map(loadFolder));
  }
  return paths.map((path) => found.get(path)).filter(Boolean);
}
