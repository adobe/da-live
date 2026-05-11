import { getNx } from '../../scripts/utils.js';
import { daFetch } from './utils.js';

const { DA_ADMIN } = await import(`${getNx()}/utils/utils.js`);

export async function listFolder(fullpath) {
  let response;
  try {
    response = await daFetch(`${DA_ADMIN}/list${fullpath}`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'List request failed', status: 0 };
  }
  if (!response.ok) return { error: `List failed: ${response.status}`, status: response.status };
  try {
    const payload = await response.json();
    if (!Array.isArray(payload)) return { error: 'Invalid list response', status: response.status };
    return payload;
  } catch {
    return { error: 'Invalid response body', status: response.status };
  }
}

export function itemHashPath(item) {
  if (!item?.path) return '';
  if (!item.ext) return item.path.replace(/^\//, '');
  return item.path.slice(1, -(item.ext.length + 1));
}
