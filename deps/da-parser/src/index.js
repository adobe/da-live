/*
 * da-parser wrapper for da-live
 * Re-exports prosemirror/yjs from da-y-wrapper, then imports da-parser logic
 */

// Re-export what da-parser needs from da-y-wrapper
export {
  Schema,
  DOMParser,
  DOMSerializer,
  addListNodes,
  tableNodes,
  prosemirrorToYXmlFragment,
  yDocToProsemirror,
} from '../../da-y-wrapper/dist/index.js';
