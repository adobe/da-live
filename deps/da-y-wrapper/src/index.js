// ProseMirror
import { EditorView } from 'prosemirror-view';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { DOMParser, DOMSerializer, Fragment, Schema, Slice } from 'prosemirror-model';
import { schema as baseSchema } from 'prosemirror-schema-basic';
import { baseKeymap, setBlockType, toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { addListNodes, wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { keymap } from 'prosemirror-keymap';
import { buildKeymap } from 'prosemirror-example-setup';
import { gapCursor } from 'prosemirror-gapcursor';
import crel from 'crelt';

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

import { MenuItem, Dropdown, renderGrouped, blockTypeItem, wrapItem } from '../../prosemirror-menu/dist/index.js';

import { InputRule, inputRules } from 'prosemirror-inputrules';

// All exported
export {
  EditorView,
  EditorState,
  DOMParser,
  DOMSerializer,
  Fragment,
  Schema,
  Slice,
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
  crel,
  MenuItem,
  Dropdown,
  renderGrouped,
  blockTypeItem,
  wrapItem,
  setBlockType,
  toggleMark,
  wrapInList,
  splitListItem,
  liftListItem,
  sinkListItem,
  undo,
  redo,
  InputRule,
  inputRules,
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
