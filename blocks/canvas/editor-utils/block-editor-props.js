import { loadBlockEditor } from '../ew-panel-extensions/helpers.js';

/**
 * Shared parsing for the block library's "editor" sheet `property` column, which is a
 * comma-separated list of flags for a block (e.g. `multi`, `quick`, or `multi, quick` —
 * the flags are not mutually exclusive).
 */

function normalize(name) {
  return (name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function parseProperties(raw) {
  return (raw || '').toLowerCase().split(',').map((p) => p.trim()).filter(Boolean);
}

/** Pure check: does the "editor" sheet mark `blockName` with `property` (comma-separated flag)? */
export function hasBlockEditorProperty(rows, blockName, property) {
  const target = normalize(blockName);
  return (rows || []).some((r) => normalize(r.block) === target
    && parseProperties(r.property).includes(property));
}

export async function blockHasEditorProperty(org, site, blockName, property) {
  return hasBlockEditorProperty(await loadBlockEditor(org, site), blockName, property);
}
