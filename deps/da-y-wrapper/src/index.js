// ProseMirror
import { EditorView } from 'prosemirror-view';
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
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
  TableMap,
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
  yDocToProsemirrorJSON,
  yXmlFragmentToProsemirrorJSON,
} from 'y-prosemirror';

import { MenuItem, Dropdown, renderGrouped, blockTypeItem, wrapItem } from '../../prosemirror-menu/dist/index.js';

import { InputRule, inputRules } from 'prosemirror-inputrules';

/**
 * Fix the block header to ensure it maintains a single cell with full colspan.
 */
function fixHeaderRowColspan(tr, tableStart, table) {
  const firstRow = table.child(0);
  const map = TableMap.get(table);
  const totalCols = map.width;

  if (firstRow.childCount === 1 && firstRow.child(0).attrs.colspan === totalCols) {
    return tr;
  }

  if (firstRow.childCount > 1) {
    const contents = [];
    let firstCellPos = null;

    firstRow.forEach((cell, offset, index) => {
      if (index === 0) {
        firstCellPos = tableStart + 1;
      }

      if (cell.textContent) {
        contents.push(cell.textContent);
      }
    });

    const blockName = contents[0] || 'columns';

    // Create a new cell with the correct colspan
    const cellType = firstRow.child(0).type;
    const para = tr.doc.type.schema.nodes.paragraph.create(
      null,
      tr.doc.type.schema.text(blockName),
    );
    const newCell = cellType.create(
      { colspan: totalCols, rowspan: 1 },
      para,
    );

    // Create new row with single merged cell
    const rowType = tr.doc.type.schema.nodes.table_row;
    const newRow = rowType.create(null, newCell);

    // Replace the entire first row
    const firstRowEnd = firstCellPos + firstRow.nodeSize - 1;
    tr.replaceWith(firstCellPos, firstRowEnd, newRow);
  } else if (firstRow.childCount === 1) {
    const cellPos = tableStart + 1;
    const cell = firstRow.child(0);
    tr.setNodeMarkup(cellPos, null, {
      ...cell.attrs,
      colspan: totalCols,
      rowspan: 1,
    });
  }

  return tr;
}

/**
 * Find the table node that contains a resolved position
 */
function findTableFromPos($pos) {
  for (let d = $pos.depth; d > 0; d -= 1) {
    const node = $pos.node(d);
    if (node.type.name === 'table') {
      const tableStart = $pos.start(d) - 1; // Position before the table
      return { table: node, tableStart, depth: d };
    }
  }
  return null;
}

// ensures header row maintains its colspan when adding columns
function addColumnBeforeWrapper(state, dispatch) {
  if (!dispatch) {
    return addColumnBefore(state, dispatch);
  }

  const originalPos = state.selection.$from.pos;

  const result = addColumnBefore(state, (tr) => {
    try {
      const $pos = tr.doc.resolve(originalPos);
      const tableInfo = findTableFromPos($pos);
      if (tableInfo) {
        const updatedTable = tr.doc.nodeAt(tableInfo.tableStart);
        if (updatedTable) {
          fixHeaderRowColspan(tr, tableInfo.tableStart, updatedTable);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not fix header row colspan:', e);
    }
    dispatch(tr);
  });

  return result;
}

// ensures header row maintains its colspan when adding columns
function addColumnAfterWrapper(state, dispatch) {
  if (!dispatch) {
    return addColumnAfter(state, dispatch);
  }

  const originalPos = state.selection.$from.pos;
  const result = addColumnAfter(state, (tr) => {
    try {
      const $pos = tr.doc.resolve(originalPos);
      const tableInfo = findTableFromPos($pos);
      if (tableInfo) {
        const updatedTable = tr.doc.nodeAt(tableInfo.tableStart);
        if (updatedTable) {
          fixHeaderRowColspan(tr, tableInfo.tableStart, updatedTable);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not fix header row colspan:', e);
    }
    dispatch(tr);
  });

  return result;
}

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
  addColumnAfterWrapper as addColumnAfter,
  addColumnBeforeWrapper as addColumnBefore,
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
  yDocToProsemirrorJSON,
  yXmlFragmentToProsemirrorJSON,
};
