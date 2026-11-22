import { createExtensionsBridgePlugin } from '../../editor-utils/extensions-bridge.js';
import { isBoundHelixBranchDocument } from './source.js';

// Branch views are available only to the scoped, explicitly bound H6 editor.
export function createEditorViewBridge(context, sourceUrl, isCurrent) {
  if (!context?.repo?.includes('~')) return createExtensionsBridgePlugin();
  if (typeof isCurrent !== 'function' || !isBoundHelixBranchDocument(context, sourceUrl)) return null;
  return createExtensionsBridgePlugin({ isCurrent });
}
