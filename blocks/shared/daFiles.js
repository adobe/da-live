import { getNx2Api, sanitizePathParts } from '../../scripts/utils.js';

export async function listFolder(fullpath) {
  try {
    const { source } = await getNx2Api();
    const { ok, items } = await source.list(fullpath);
    if (!ok) return { error: 'List failed', status: 0 };
    return items;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'List request failed', status: 0 };
  }
}

export function itemHashPath(item) {
  if (!item?.path) return '';
  if (!item.ext) return item.path.replace(/^\//, '');
  return item.path.slice(1, -(item.ext.length + 1));
}

// Builds the published AEM preview URL for a doc/sheet, e.g.
// https://main--site--org.aem.page/path — same format as da-list's "Copy URLs".
export function getAemUrl(item) {
  if (!item?.path || !item.ext) return '';
  const [org, site, ...pathParts] = sanitizePathParts(item.path.replace(/\.html$/, ''));
  const pageName = pathParts.pop();
  pathParts.push(pageName === 'index' ? '' : pageName);
  return `https://main--${site}--${org}.aem.page/${pathParts.join('/')}`;
}
