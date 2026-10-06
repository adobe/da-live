// Test fixture mirroring da-nx nx2/utils/editor.js.
import { getFirstSheet } from './daConfig.js';

/**
 * Resolves the editor configured for `path` via `editor.path` rows (`prefix=editorUrl`).
 * Site rows come before org rows and the longest matching prefix wins.
 * @param {object} params
 * @param {string} params.path - Full path, e.g. `/org/site/folder/page`.
 * @param {Array} params.configs - The [org, site] configs from fetchDaConfigs.
 * @returns {string|undefined} The editor URL, or undefined when no rule matches.
 */
export function getEditor({ path, configs }) {
  const [match] = (configs ?? []).filter(Boolean).reverse()
    .flatMap((config) => getFirstSheet(config) ?? [])
    .filter(({ key, value }) => key === 'editor.path' && path.startsWith(value.split('=')[0]))
    .sort((a, b) => b.value.split('=')[0].length - a.value.split('=')[0].length);
  return match?.value.split('=')[1];
}
