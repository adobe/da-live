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
  tableEditing,
} from 'da-y-wrapper';
import { createTestEditor, destroyEditor } from './test-helpers.js';
import insertTable from '../../../../../blocks/edit/prose/table.js';
import tableHeaderFix from '../../../../../blocks/edit/prose/plugins/tableHeaderFix.js';

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
      editor = await createTestEditor({ additionalPlugins: [tableEditing(), tableHeaderFix()] });
      const { view } = editor;

      // Insert a table (starts with 2 columns)
      insertTable(view.state, view.dispatch);

      // Change the block name to a custom value by replacing the header cell content
      const customBlockName = 'my-custom-block';
      const table = view.state.doc.firstChild;
      const headerCell = table.child(0).child(0);
      const cellStart = 3; // Position of the table cell content
      const para = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text(customBlockName),
      );
      const updateNameTr = view.state.tr.replaceWith(
        cellStart + 1,
        cellStart + 1 + headerCell.content.size,
        para,
      );
      view.dispatch(updateNameTr);

      // Move cursor to second row, first cell
      const table2 = view.state.doc.firstChild;
      const headerSize = table2.child(0).nodeSize;
      const secondRowPos = view.state.doc.resolve(1 + headerSize + 1);
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
      expect(updatedFirstRow.child(0).textContent).to.equal(
        customBlockName,
        'Block name should be preserved',
      );
    });

    it('should maintain header colspan when adding column after', async () => {
      editor = await createTestEditor({ additionalPlugins: [tableEditing(), tableHeaderFix()] });
      const { view } = editor;

      // Insert a table (starts with 2 columns)
      insertTable(view.state, view.dispatch);

      // Change the block name to a custom value by replacing the header cell content
      const customBlockName = 'hero-banner';
      const table = view.state.doc.firstChild;
      const headerCell = table.child(0).child(0);
      const cellStart = 3; // Position of the table cell content
      const para = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text(customBlockName),
      );
      const updateNameTr = view.state.tr.replaceWith(
        cellStart + 1,
        cellStart + 1 + headerCell.content.size,
        para,
      );
      view.dispatch(updateNameTr);

      // Move cursor to second row, last cell
      const table2 = view.state.doc.firstChild;
      const headerSize = table2.child(0).nodeSize;
      const secondRowPos = view.state.doc.resolve(1 + headerSize + 2);
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
      expect(updatedFirstRow.child(0).textContent).to.equal(
        customBlockName,
        'Block name should be preserved',
      );
    });
  });
});
