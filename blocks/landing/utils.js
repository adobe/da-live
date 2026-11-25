import { getFileItemHref } from '../shared/da-file-item/navigation.js';
import { getConfiguredEditor } from '../shared/da-file-item/edit-path.js';
import { pathMatchesActiveBranch } from '../shared/branch-selector/context.js';
import { discoverDaRsCapabilities, siteItemCapabilities } from '../shared/da-rs-provider.js';
import { isDaRsSelected } from '../shared/da-rs-bootstrap.js';

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
  ['nx', 'nxver', 'quick-edit', 'ew', 'nx-chat-ao', 'theme', 'rum', 'da-source', 'da-admin', 'da-collab'].forEach((key) => {
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

// The Source profile is only a cue; the site capabilities decide. A cue/capability mismatch or
// failed discovery drops the item instead of granting the imported viewer.
async function importedPageCapabilities({ path, response, discover, signal }) {
  const profile = response.headers.get('x-da-content-profile');
  if (!isDaRsSelected() || profile !== 'aem-import'
    || response.headers.get('x-da-source-kind') !== 'page') return null;
  const [, org, site] = path.split('/');
  if (!org || !site || site.includes('~')) throw new Error('Invalid imported page path');
  const caps = await discover(org, site);
  signal.throwIfAborted();
  if (caps?.contentProfile !== 'aem-import') throw new Error('Imported profile mismatch');
  return siteItemCapabilities(caps, 'page', []);
}

export async function loadFilesByPath({ paths, source, signal }) {
  const files = [];
  const sites = new Map();
  const discover = (org, site) => {
    const key = `${org}/${site}`;
    if (!sites.has(key)) sites.set(key, discoverDaRsCapabilities(org, site));
    return sites.get(key);
  };
  for (let offset = 0; offset < paths.length; offset += METADATA_CONCURRENCY) {
    const batch = await Promise.all(paths.slice(offset, offset + METADATA_CONCURRENCY)
      .map(async (path) => {
        signal.throwIfAborted();
        if (!pathMatchesActiveBranch(path)) return undefined;
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
          const hydrated = {
            ...item,
            lastModified: Number.isNaN(lastModified) ? undefined : lastModified,
          };
          const capabilities = item.ext === 'html'
            ? await importedPageCapabilities({ path, response, discover, signal })
            : null;
          if (capabilities) hydrated.capabilities = capabilities;
          return hydrated;
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
