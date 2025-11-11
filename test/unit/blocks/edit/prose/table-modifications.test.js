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
});
