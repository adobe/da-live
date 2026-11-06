// Where a section's values live, and everything that depends on it. A section is stored in one
// of three ways (see sections.js):
//   config(sheet)        a sheet of the org/site config; at site scope it inherits the org's
//                        sheet unless `inherit: false` (the editor reads it from the site only).
//   file(path, sheets)   a fixed content file of the site; `sheets` maps each part to its tab.
//   library(title, paths) a list the site's `library` config row registers by `title`; Set up
//                        registers the first of `paths` that exists, else creates the first.
//                        The editor reads the list from the file's first sheet.

import { readSource, saveConfig, saveSource } from './api.js';
import { firstSheetName } from './sheets.js';
import { libraryRegistration, librarySourcePath, listPaths } from './library-paths.js';

export const config = (sheet, { inherit = true } = {}) => ({ type: 'config', sheet, inherit });
export const file = (path, sheets) => ({ type: 'file', path, sheets });
export const library = (title, paths = listPaths(title.toLowerCase())) => ({ type: 'library', title, paths });

export const inFile = (store) => store.type !== 'config';

export const inherits = (store) => store.type === 'config' && store.inherit;

// The sheet a panel (or part) edits. `json` is the file as last read: a library list is in
// whatever its first sheet is called.
export function sheetFor(store, { part = null, json = null } = {}) {
  if (store.type === 'config') return store.sheet;
  if (store.type === 'file') return store.sheets[part.id];
  return firstSheetName(json);
}

// Where a file store's content is, before reading it:
// { status: 'ready', path, registered } | { status: 'unregistered' }
// | { status: 'external', registered }.
export function locate(store, { org, site, siteConfig }) {
  if (store.type === 'file') return { status: 'ready', path: store.path, registered: null };
  const registered = libraryRegistration(siteConfig, store.title)?.path;
  if (!registered) return { status: 'unregistered' };
  const path = librarySourcePath(registered, org, site);
  if (!path) return { status: 'external', registered };
  return { status: 'ready', path, registered };
}

// Reads a file store's content: `locate`'s result with `status` 'ok' (plus `json`, and `missing`
// when the file doesn't exist yet) or 'error' (plus `httpStatus`).
export async function readFile(store, ctx) {
  const location = locate(store, ctx);
  if (location.status !== 'ready') return location;
  const result = await readSource(ctx.org, ctx.site, location.path);
  if (result.ok || result.status === 404) {
    return { ...location, status: 'ok', json: result.ok ? result.data : null, missing: !result.ok };
  }
  return { ...location, status: 'error', httpStatus: result.status };
}

// Where the values can be opened in DA, or null: the org/site config, or the file's sheet once it
// exists. Relative, so it opens on the same DA as this page.
export function sheetUrl(store, { org, site, located }) {
  if (!inFile(store)) return `/config#/${org}/${site ? `${site}/` : ''}`;
  if (located?.status !== 'ok' || located.missing) return null;
  return `/sheet#/${org}/${site}${located.path.replace(/\.json$/, '')}`;
}

// `path` is the located file, if any.
export function save(store, { org, site, path }, mutate) {
  return inFile(store) ? saveSource(org, site, path, mutate) : saveConfig(org, site, mutate);
}
