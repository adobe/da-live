import { loadBlockEditor } from '../ew-panel-extensions/helpers.js';
import { hasBlockEditorProperty } from './block-editor-props.js';

/**
 * "Quick blocks" — blocks marked in the block library's "editor" sheet with a
 * `property` containing `quick` (comma-separated; not mutually exclusive with other
 * flags like `multi`). For these, the doc-mode editor can render each cell as an
 * individually-editable pill (see prose-plugins/quickBlockView.js) instead of the
 * raw table, with a toggle to switch back to the default table view.
 */

export function isQuickBlockConfigured(rows, blockName) {
  return hasBlockEditorProperty(rows, blockName, 'quick');
}

export async function isQuickBlock(org, site, blockName) {
  return isQuickBlockConfigured(await loadBlockEditor(org, site), blockName);
}
