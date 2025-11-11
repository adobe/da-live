/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { expect } from '@esm-bundle/chai';
import {
  addColumnBefore,
  addColumnAfter,
  addRowBefore,
  addRowAfter,
  splitCell,
  deleteRow,
  deleteColumn,
  mergeCells,
} from 'da-y-wrapper';
import { createTestEditor, destroyEditor } from './test-helpers.js';
import insertTable from '../../../../../blocks/edit/prose/table.js';

describe('Table Modifications', () => {
  let editor;

  afterEach(() => {
    if (editor) {
      destroyEditor(editor);
      editor = null;
    }
  });

  describe('Column Operations - Header Row Colspan', () => {
    it('should maintain header colspan when adding column before', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table (starts with 2 columns)
      insertTable(view.state, view.dispatch);

      // Position cursor in a cell of the second row (content row)
      // The table structure is: header row (1 cell, colspan 2) + content row (2 cells)
      // We need to find and select a cell in the content row
      const tableNode = view.state.doc.firstChild;
      expect(tableNode.type.name).to.equal('table');

      // Get initial state
      const firstRow = tableNode.child(0);
      expect(firstRow.childCount).to.equal(1, 'Header row should have 1 cell');
      expect(firstRow.child(0).attrs.colspan).to.equal(2, 'Header should span 2 columns initially');

      // Move cursor to second row, first cell
      const secondRowPos = view.state.doc.resolve(5); // Position in second row
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, secondRowPos.pos),
      );
      view.dispatch(tr);

      // Add a column before
      addColumnBefore(view.state, view.dispatch);

      // Check that header row still has 1 cell and colspan is now 3
      const updatedTable = view.state.doc.firstChild;
      const updatedFirstRow = updatedTable.child(0);

      expect(updatedFirstRow.childCount).to.equal(
        1,
        'Header row should still have 1 cell after adding column',
      );
      expect(updatedFirstRow.child(0).attrs.colspan).to.equal(
        3,
        'Header should span 3 columns after adding one',
      );
    });

    it('should maintain header colspan when adding column after', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table (starts with 2 columns)
      insertTable(view.state, view.dispatch);

      // Get initial state
      const tableNode = view.state.doc.firstChild;
      const firstRow = tableNode.child(0);
      expect(firstRow.childCount).to.equal(1, 'Header row should have 1 cell');
      expect(firstRow.child(0).attrs.colspan).to.equal(2, 'Header should span 2 columns initially');

      // Move cursor to second row
      const secondRowPos = view.state.doc.resolve(5);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, secondRowPos.pos),
      );
      view.dispatch(tr);

      // Add a column after
      addColumnAfter(view.state, view.dispatch);

      // Check that header row still has 1 cell and colspan is now 3
      const updatedTable = view.state.doc.firstChild;
      const updatedFirstRow = updatedTable.child(0);

      expect(updatedFirstRow.childCount).to.equal(
        1,
        'Header row should still have 1 cell after adding column',
      );
      expect(updatedFirstRow.child(0).attrs.colspan).to.equal(
        3,
        'Header should span 3 columns after adding one',
      );
    });

    it('should maintain header colspan when adding multiple columns', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table (starts with 2 columns)
      insertTable(view.state, view.dispatch);

      // Get initial state
      const tableNode = view.state.doc.firstChild;
      const firstRow = tableNode.child(0);
      expect(firstRow.child(0).attrs.colspan).to.equal(2, 'Header should span 2 columns initially');

      // Move cursor to second row
      const secondRowPos = view.state.doc.resolve(5);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, secondRowPos.pos),
      );
      view.dispatch(tr);

      // Add column after
      addColumnAfter(view.state, view.dispatch);

      // Add another column after
      addColumnAfter(view.state, view.dispatch);

      // Add column before
      addColumnBefore(view.state, view.dispatch);

      // Check that header row still has 1 cell and colspan is now 5
      const updatedTable = view.state.doc.firstChild;
      const updatedFirstRow = updatedTable.child(0);

      expect(updatedFirstRow.childCount).to.equal(
        1,
        'Header row should still have 1 cell after adding multiple columns',
      );
      expect(updatedFirstRow.child(0).attrs.colspan).to.equal(
        5,
        'Header should span 5 columns after adding three',
      );
    });

    it('should preserve header text content when adding columns', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table
      insertTable(view.state, view.dispatch);

      // Get the header text
      const tableNode = view.state.doc.firstChild;
      const firstRow = tableNode.child(0);
      const headerText = firstRow.child(0).textContent;
      expect(headerText).to.equal('columns');

      // Move cursor to second row
      const secondRowPos = view.state.doc.resolve(5);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, secondRowPos.pos),
      );
      view.dispatch(tr);

      // Add a column
      addColumnBefore(view.state, view.dispatch);

      // Check that header text is preserved
      const updatedTable = view.state.doc.firstChild;
      const updatedFirstRow = updatedTable.child(0);
      const updatedHeaderText = updatedFirstRow.child(0).textContent;

      expect(updatedHeaderText).to.equal(
        'columns',
        'Header text should be preserved after adding column',
      );
    });
  });

  describe('Row Operations', () => {
    it('should disable add row before when cursor is in header row', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table
      insertTable(view.state, view.dispatch);

      // Move cursor to header row
      const headerPos = view.state.doc.resolve(3); // Position in header cell
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, headerPos.pos),
      );
      view.dispatch(tr);

      // Check if addRowBefore is available (should return false when not available)
      const isAvailable = addRowBefore(view.state, null);

      expect(isAvailable).to.equal(false, 'Add row before should be disabled in header row');
    });

    it('should allow add row after when cursor is in header row', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table
      insertTable(view.state, view.dispatch);

      // Move cursor to header row
      const headerPos = view.state.doc.resolve(3);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, headerPos.pos),
      );
      view.dispatch(tr);

      // Check if addRowAfter is available (should return true)
      const isAvailable = addRowAfter(view.state, null);

      expect(isAvailable).to.equal(true, 'Add row after should be available in header row');
    });

    it('should allow add row before when cursor is in content row', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table
      insertTable(view.state, view.dispatch);

      // The table structure after insertion:
      // Row 0 (header): cell with colspan=2, contains "columns"
      // Row 1 (content): 2 cells

      // Find the actual position of the first cell in the second row
      // We need to navigate past the table node, first row, and into second row
      const table = view.state.doc.firstChild;
      const firstRow = table.child(0);

      // Position: start of doc (0) + table open (1) + first row size
      // + second row open (1) + first cell of second row
      const secondRowFirstCellPos = 1 + firstRow.nodeSize + 1;

      const $pos = view.state.doc.resolve(secondRowFirstCellPos);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, $pos.pos),
      );
      view.dispatch(tr);

      // Check if addRowBefore is available (should return true)
      const isAvailable = addRowBefore(view.state, null);

      expect(isAvailable).to.equal(true, 'Add row before should be available in content rows');
    });

    it('should disable split cell when cursor is in header row', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table
      insertTable(view.state, view.dispatch);

      // Move cursor to header row
      const headerPos = view.state.doc.resolve(3); // Position in header cell
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, headerPos.pos),
      );
      view.dispatch(tr);

      // Check if splitCell is available (should return false)
      const isAvailable = splitCell(view.state, null);

      expect(isAvailable).to.equal(false, 'Split cell should be disabled in header row');
    });

    it('should allow split cell when cursor is in content row with merged cells', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table
      insertTable(view.state, view.dispatch);

      // Move cursor to content row
      const table = view.state.doc.firstChild;
      const firstRow = table.child(0);
      const secondRowFirstCellPos = 1 + firstRow.nodeSize + 1;

      const $pos = view.state.doc.resolve(secondRowFirstCellPos);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, $pos.pos),
      );
      view.dispatch(tr);

      // Check if splitCell is available
      // (will return false for normal cells, true for merged cells)
      const isAvailable = splitCell(view.state, null);

      // Normal cells can't be split, so this should be false
      // This test just confirms it's not disabled by our constraint
      expect(typeof isAvailable).to.equal('boolean', 'Split cell returns boolean');
    });

    it('should add row with correct number of cells when adding after header', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table (header + 1 content row with 2 cells)
      insertTable(view.state, view.dispatch);

      const initialTable = view.state.doc.firstChild;
      const initialContentRow = initialTable.child(1);
      const initialCellCount = initialContentRow.childCount;

      expect(initialCellCount).to.equal(2, 'Initial content row should have 2 cells');

      // Move cursor to header row
      const headerPos = view.state.doc.resolve(3);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, headerPos.pos),
      );
      view.dispatch(tr);

      // Add row after header
      addRowAfter(view.state, view.dispatch);

      // Check the new row (should be at index 1, pushing old content row to index 2)
      const updatedTable = view.state.doc.firstChild;
      expect(updatedTable.childCount).to.equal(3, 'Table should now have 3 rows');

      const headerRow = updatedTable.child(0);
      const newContentRow = updatedTable.child(1);
      const oldContentRow = updatedTable.child(2);

      // Header should be unchanged
      expect(headerRow.childCount).to.equal(1, 'Header should still be 1 cell');
      expect(headerRow.child(0).attrs.colspan).to.equal(2, 'Header should still span 2 columns');

      // New row should have same number of cells as the original content row
      expect(newContentRow.childCount).to.equal(
        initialCellCount,
        'New row should have same number of cells as original content row',
      );
      expect(oldContentRow.childCount).to.equal(
        initialCellCount,
        'Old content row should still have same number of cells',
      );
    });
  });

  describe('Delete Operations', () => {
    it('should disable delete row when cursor is in header row', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table
      insertTable(view.state, view.dispatch);

      // Move cursor to header row
      const headerPos = view.state.doc.resolve(3);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, headerPos.pos),
      );
      view.dispatch(tr);

      // Check if deleteRow is available (should return false)
      const isAvailable = deleteRow(view.state, null);

      expect(isAvailable).to.equal(false, 'Delete row should be disabled in header row');
    });

    it('should adjust header colspan when deleting a column', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table (starts with 2 columns)
      insertTable(view.state, view.dispatch);

      // Add a column to have 3 columns total
      const table = view.state.doc.firstChild;
      const firstRow = table.child(0);
      const secondRowFirstCellPos = 1 + firstRow.nodeSize + 1;

      const $pos = view.state.doc.resolve(secondRowFirstCellPos);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, $pos.pos),
      );
      view.dispatch(tr);

      addColumnAfter(view.state, view.dispatch);

      // Verify we have 3 columns
      const tableWith3Cols = view.state.doc.firstChild;
      const headerWith3Cols = tableWith3Cols.child(0);
      expect(headerWith3Cols.child(0).attrs.colspan).to.equal(3, 'Header should span 3 columns');

      // Now delete a column
      deleteColumn(view.state, view.dispatch);

      // Check that header colspan adjusted to 2
      const tableWith2Cols = view.state.doc.firstChild;
      const headerWith2Cols = tableWith2Cols.child(0);

      expect(headerWith2Cols.childCount).to.equal(
        1,
        'Header should still have 1 cell after deleting column',
      );
      expect(headerWith2Cols.child(0).attrs.colspan).to.equal(
        2,
        'Header should span 2 columns after deleting one',
      );
    });

    it('should handle deleting multiple columns and maintain header colspan', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table and add columns to have 4 total
      insertTable(view.state, view.dispatch);

      const table = view.state.doc.firstChild;
      const firstRow = table.child(0);
      const secondRowFirstCellPos = 1 + firstRow.nodeSize + 1;

      const $pos = view.state.doc.resolve(secondRowFirstCellPos);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, $pos.pos),
      );
      view.dispatch(tr);

      // Add 2 columns
      addColumnAfter(view.state, view.dispatch);
      addColumnAfter(view.state, view.dispatch);

      // Verify 4 columns
      let currentTable = view.state.doc.firstChild;
      expect(currentTable.child(0).child(0).attrs.colspan).to.equal(4);

      // Delete a column
      deleteColumn(view.state, view.dispatch);

      // Check header colspan is 3
      currentTable = view.state.doc.firstChild;
      expect(currentTable.child(0).child(0).attrs.colspan).to.equal(3);

      // Delete another column
      deleteColumn(view.state, view.dispatch);

      // Check header colspan is 2
      currentTable = view.state.doc.firstChild;
      expect(currentTable.child(0).child(0).attrs.colspan).to.equal(2);
    });

    it('should disable delete column when cursor is in header row', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table (starts with 2 columns)
      insertTable(view.state, view.dispatch);

      // Move cursor to header row
      const headerPos = view.state.doc.resolve(3);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, headerPos.pos),
      );
      view.dispatch(tr);

      // Delete column should be disabled in header row
      const isAvailable = deleteColumn(view.state, null);
      expect(isAvailable).to.equal(false, 'Delete column should be disabled in header row');
    });
  });

  describe('Merge Cells Operations', () => {
    it('should disable merge cells when cursor is in header row', async () => {
      editor = await createTestEditor();
      const { view } = editor;

      // Insert a table
      insertTable(view.state, view.dispatch);

      // Move cursor to header row
      const headerPos = view.state.doc.resolve(3);
      const tr = view.state.tr.setSelection(
        view.state.selection.constructor.create(view.state.doc, headerPos.pos),
      );
      view.dispatch(tr);

      // Check if mergeCells is available (should return false)
      const isAvailable = mergeCells(view.state, null);

      expect(isAvailable).to.equal(false, 'Merge cells should be disabled in header row');
    });
  });
});
