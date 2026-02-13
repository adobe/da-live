// ProseMirror
import { EditorView } from 'prosemirror-view';
import { EditorState, Plugin, PluginKey, TextSelection, NodeSelection } from 'prosemirror-state';
import { DOMParser, DOMSerializer, Fragment, Schema, Slice } from 'prosemirror-model';
import { schema as baseSchema } from 'prosemirror-schema-basic';
import { baseKeymap, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { addListNodes, wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { keymap } from 'prosemirror-keymap';
import { buildKeymap } from 'prosemirror-example-setup';
import { gapCursor } from 'prosemirror-gapcursor';

import {
  tableEditing,
  columnResizing,
  goToNextCell,
  selectedRect,
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
  isInTable,
} from 'prosemirror-tables';

// yjs
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  yUndoPluginKey,
  undo as yUndo,
  redo as yRedo,
  prosemirrorToYDoc,
  prosemirrorToYXmlFragment,
  yDocToProsemirror,
  yDocToProsemirrorJSON,
  yXmlFragmentToProsemirrorJSON,
} from 'y-prosemirror';

import { MenuItem, Dropdown, renderGrouped, blockTypeItem, wrapItem } from '../../prosemirror-menu/dist/index.js';

import { InputRule, inputRules, wrappingInputRule } from 'prosemirror-inputrules';

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
  PluginKey,
  TextSelection,
  NodeSelection,
  baseSchema,
  baseKeymap,
  addListNodes,
  keymap,
  buildKeymap,
  tableEditing,
  columnResizing,
  goToNextCell,
  isInTable,
  selectedRect,
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
  wrapItem,
  wrapIn,
  setBlockType,
  toggleMark,
  wrapInList,
  splitListItem,
  liftListItem,
  sinkListItem,
  InputRule,
  inputRules,
  wrappingInputRule,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  yUndoPluginKey,
  yUndo,
  yRedo,
  prosemirrorToYDoc,
  prosemirrorToYXmlFragment,
  yDocToProsemirror,
  yDocToProsemirrorJSON,
  yXmlFragmentToProsemirrorJSON,
};
