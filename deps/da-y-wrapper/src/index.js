// ProseMirror
import { EditorView } from 'prosemirror-view';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { Schema, DOMParser, Fragment } from 'prosemirror-model';
import { schema as baseSchema } from 'prosemirror-schema-basic';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { addListNodes, wrapInList } from 'prosemirror-schema-list';
import { keymap } from 'prosemirror-keymap';
import { buildKeymap } from 'prosemirror-example-setup';
import { gapCursor } from 'prosemirror-gapcursor';

import {
  tableEditing,
  columnResizing,
  goToNextCell,
  tableNodes,
  fixTables,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  deleteTable,
} from 'prosemirror-tables';

// yjs
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  undo as yUndo,
  redo as yRedo,
  prosemirrorToYDoc,
  prosemirrorToYXmlFragment,
  yDocToProsemirrorJSON,
  yXmlFragmentToProsemirrorJSON,
} from 'y-prosemirror';

import { MenuItem, Dropdown, renderGrouped, blockTypeItem } from '../../prosemirror-menu/dist/index.js';

// All exported
export {
  EditorView,
  EditorState,
  Schema,
  DOMParser,
  Fragment,
  Plugin,
  TextSelection,
  baseSchema,
  baseKeymap,
  addListNodes,
  keymap,
  buildKeymap,
  history,
  tableEditing,
  columnResizing,
  goToNextCell,
  tableNodes,
  fixTables,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  deleteTable,
  gapCursor,
  MenuItem,
  Dropdown,
  renderGrouped,
  blockTypeItem,
  toggleMark,
  wrapInList,
  undo,
  redo,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  yUndo,
  yRedo,
  prosemirrorToYDoc,
  prosemirrorToYXmlFragment,
  yDocToProsemirrorJSON,
  yXmlFragmentToProsemirrorJSON,
};
