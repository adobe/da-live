import { getNx2Api } from '../../scripts/utils.js';

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
