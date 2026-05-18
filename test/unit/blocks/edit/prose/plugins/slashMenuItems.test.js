import { expect } from '@esm-bundle/chai';
import {
  getDefaultItems,
  getTableItems,
  getTableCellItems,
} from '../../../../../../blocks/edit/prose/plugins/slashMenu/slashMenuItems.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

describe('slashMenuItems factories', () => {
  let editor;

  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('getDefaultItems returns a list of structured commands', () => {
    const items = getDefaultItems();
    expect(items.length).to.be.greaterThan(8);
    items.forEach((item) => {
      expect(item).to.have.property('title');
      expect(item).to.have.property('command');
      expect(item).to.have.property('class');
      expect(typeof item.command).to.equal('function');
    });
    // Sanity: known entries
    const titles = items.map((i) => i.title);
    expect(titles).to.include.members([
      'Heading 1', 'Heading 2', 'Heading 3',
      'Blockquote', 'Code block',
      'Bullet list', 'Numbered list',
      'Section break', 'Lorem ipsum', 'Block',
    ]);
  });

  it('getDefaultItems entries have unique titles', () => {
    const items = getDefaultItems();
    const titles = items.map((i) => i.title);
    expect(new Set(titles).size).to.equal(titles.length);
  });

  it('getTableItems wraps the table-options submenu and excludes section break', () => {
    const items = getTableItems(editor.view.state);
    expect(items[0].title).to.equal('Edit Block');
    expect(items[0]).to.have.property('submenu');
    // Section break has excludeFromTable: true and should not appear
    expect(items.find((i) => i.title === 'Section break')).to.equal(undefined);
    // Other defaults should still be in the list
    expect(items.find((i) => i.title === 'Heading 1')).to.exist;
  });

  it('getTableCellItems filters out unavailable commands', () => {
    // Outside a table cell, mergeCells returns false and the entry is filtered out.
    const items = getTableCellItems(editor.view.state);
    expect(items).to.deep.equal([]);
  });
});
