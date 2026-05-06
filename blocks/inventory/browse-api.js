import { DA_ADMIN } from '../shared/nxutils.js';
import { daFetch } from '../shared/utils.js';

/**
 * Folder listing for the given fullpath.
 * @param {string} fullpath
 * @returns {Promise<unknown[] | { error: string; status: number }>}
 */
export async function listFolder(fullpath) {
  let response;
  try {
    response = await daFetch(`${DA_ADMIN}/list${fullpath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List request failed';
    return { error: message, status: 0 };
  }
  if (!response.ok) {
    return { error: `List failed: ${response.status}`, status: response.status };
  }
  try {
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return { error: 'Invalid list response', status: response.status };
    }
    return payload;
  } catch {
    return { error: 'Invalid response body', status: response.status };
  }
}
