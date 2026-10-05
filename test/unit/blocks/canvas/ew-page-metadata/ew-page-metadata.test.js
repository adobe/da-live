/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getExtensionsBridge;

before(async () => {
  await import('../../../../../blocks/canvas/ew-page-metadata/ew-page-metadata.js');
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
});

async function createPanel() {
  const el = document.createElement('ew-page-metadata');
  el._loadLibraryFields = async () => {};
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function rowFor(el, key) {
  return el.shadowRoot.querySelector(`.ew-pm-row[data-key="${key}"]`);
}

// Direct doc inspection, mirroring what readMetadataRows itself reads.
function tableRows(view) {
  let tablePos = -1;
  view.state.doc.descendants((n, p) => { if (n.type.name === 'table' && tablePos < 0) tablePos = p; });
  if (tablePos < 0) return [];
  const table = view.state.doc.nodeAt(tablePos);
  const rows = [];
  table.forEach((row, offset, index) => {
    if (index === 0) return;
    rows.push({ key: row.child(0).textContent, value: row.child(1).textContent });
  });
  return rows;
}

function baseDoc() {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] };
}

function metadataTableJSON(rows) {
  const cell = (attrs, text) => ({
    type: 'table_cell',
    attrs,
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  });
  return {
    type: 'table',
    content: [
      { type: 'table_row', content: [cell({ colspan: 2 }, 'Metadata')] },
      ...rows.map(([key, value]) => ({
        type: 'table_row',
        content: [cell({ colspan: 1 }, key), cell({ colspan: 1 }, value)],
      })),
    ],
  };
}

describe('ew-page-metadata', () => {
  let el;
  let bridge;

  beforeEach(async () => {
    el = await createPanel();
    bridge = getExtensionsBridge();
  });

  afterEach(() => {
    el.remove();
    bridge.view = null;
    canvasBus.editorHtmlState.emit('');
  });

  describe('panel chrome', () => {
    it('shows "Page Metadata" as the panel headline', async () => {
      expect(el.shadowRoot.querySelector('h3').textContent).to.equal('Page Metadata');
    });

    it('uses NX form/button styles for inputs and icon buttons', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['custom', 'x']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const row = rowFor(el, 'custom');
      const addBtn = el.shadowRoot.querySelector('.add-btn');
      expect(row.classList.contains('nx-form-field')).to.equal(true);
      expect(row.querySelector('input[type="text"]').classList.contains('nx-input')).to.equal(true);
      expect(row.querySelector('.delete-btn').classList.contains('nx-action-btn-icon')).to.equal(true);
      expect(addBtn.classList.contains('nx-action-btn-icon')).to.equal(true);
      expect(addBtn.getAttribute('aria-label')).to.equal('Add page metadata field');
    });

    it('renders the add-field dialog with its copy and NX inputs', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      el.shadowRoot.querySelector('.add-btn').click();
      await el.updateComplete;
      const dialog = el.shadowRoot.querySelector('.ew-pm-add');
      const [keyLabel, valueLabel] = dialog.querySelectorAll('.nx-form-field > span:first-child');
      expect(dialog.getAttribute('title')).to.equal('Add page metadata field');
      expect(keyLabel.textContent.replace(/\s+/g, '')).to.equal('Fieldname*');
      expect(dialog.querySelector('input[name="key"]').getAttribute('aria-required')).to.equal('true');
      expect(valueLabel.textContent.trim()).to.equal('Value');
      expect(dialog.querySelector('input[name="value"]').classList.contains('nx-input')).to.equal(true);
    });
  });

  describe('fallback + read path', () => {
    it('renders default Title/Description text fields when there is no library config', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      ['Title', 'Description'].forEach((key) => {
        expect(rowFor(el, key).querySelector('input[type="text"]').value).to.equal('');
      });
    });

    it('renders unconfigured doc keys alongside fallback fields when there is no library config', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['legacy-flag', 'yes']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      expect(rowFor(el, 'legacy-flag').querySelector('input[type="text"]').value).to.equal('yes');
      expect(rowFor(el, 'Title')).to.exist;
      expect(rowFor(el, 'Description')).to.exist;
    });

    it('renders configured fields plus unconfigured doc keys when library config is present', async () => {
      bridge.view = makeRealView({
        type: 'doc',
        content: [metadataTableJSON([['category', 'news'], ['legacy-flag', 'yes']])],
      });
      el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      expect(rowFor(el, 'category').querySelector('nx-picker')).to.exist;
      expect(rowFor(el, 'legacy-flag').querySelector('input[type="text"]').value).to.equal('yes');
    });

    it('pre-fills from the doc, and clears when editorHtmlState signals the doc was unloaded', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['title', 'My Page']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('My Page');

      canvasBus.editorHtmlState.emit('');
      await el.updateComplete;
      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('');
    });
  });

  describe('config-driven rendering', () => {
    it('renders a single-select dropdown with a leading empty option', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['category', 'news']])] });
      el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const picker = rowFor(el, 'category').querySelector('nx-picker');
      expect(picker).to.exist;
      expect(picker.getAttribute('size')).to.equal('m');
      expect(picker.value).to.equal('news');
      expect(picker.items).to.deep.equal([
        { value: '', label: 'None' },
        { value: 'news', label: 'News' },
      ]);
    });

    it('renders ew-metadata-multiselect for a multi-select field', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['tags', 'a, b']])] });
      el._libraryFields = [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }] }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const multi = rowFor(el, 'tags').querySelector('ew-metadata-multiselect');
      expect(multi).to.exist;
      expect(multi.value).to.equal('a, b');
    });

    it('renders color fields as a picker with swatches', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['accent', 'adobe-red']])] });
      el._libraryFields = [{
        key: 'accent',
        label: 'Accent',
        type: 'single',
        values: [{ title: 'Adobe Red', value: 'adobe-red', colorValue: '#FF0000' }, { title: 'Sky', value: 'sky' }],
      }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const picker = rowFor(el, 'accent').querySelector('nx-picker');
      expect(picker.value).to.equal('adobe-red');
      expect(picker.items).to.deep.equal([
        { value: '', label: 'None' },
        { value: 'adobe-red', label: 'Adobe Red', swatch: '#FF0000' },
        { value: 'sky', label: 'Sky' },
      ]);
    });

    it('renders a json field as a textarea with pretty-printed JSON', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['json-ld', '{"@type":"Article"}']])] });
      el._libraryFields = [{ key: 'json-ld', label: 'JSON-LD', type: 'json', values: null }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const textarea = rowFor(el, 'json-ld').querySelector('textarea');
      expect(textarea.classList.contains('nx-input')).to.equal(true);
      expect(textarea.value).to.equal('{\n  "@type": "Article"\n}');
    });

    it('flags a json field holding invalid JSON with an error message', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['json-ld', '{broken']])] });
      el._libraryFields = [{ key: 'json-ld', label: 'JSON-LD', type: 'json', values: null }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const row = rowFor(el, 'json-ld');
      expect(row.classList.contains('nx-field-error')).to.equal(true);
      expect(row.querySelector('.nx-input-error-msg').textContent.trim()).to.equal('Invalid JSON');
    });

    it('selects the empty option when the field has no current value', async () => {
      bridge.view = makeRealView(baseDoc());
      el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const picker = rowFor(el, 'category').querySelector('nx-picker');
      expect(picker.value).to.equal('');
    });
  });

  describe('write-back', () => {
    it('creates the metadata table and commits a value on text-field blur when none exists yet', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const input = rowFor(el, 'Title').querySelector('input[type="text"]');
      input.value = 'Brand new';
      input.dispatchEvent(new Event('blur'));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Title', value: 'Brand new' }]);
    });

    it('commits a picker change to the existing row', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['category', 'news']])] });
      el._libraryFields = [{
        key: 'category',
        label: 'Category',
        type: 'single',
        values: [{ title: 'News', value: 'news' }, { title: 'Blog', value: 'blog' }],
      }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const picker = rowFor(el, 'category').querySelector('nx-picker');
      picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'blog' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'category', value: 'blog' }]);
    });

    it('removes the row when the empty option is selected', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['category', 'news'], ['custom', 'x']])] });
      el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const picker = rowFor(el, 'category').querySelector('nx-picker');
      picker.dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'custom', value: 'x' }]);
    });

    it('removes the row when a text field is emptied', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page'], ['Description', 'Desc']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const input = rowFor(el, 'Title').querySelector('input[type="text"]');
      input.value = '   ';
      input.dispatchEvent(new Event('blur'));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Description', value: 'Desc' }]);
    });

    it('removes the row when all multiselect values are cleared', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['tags', 'a'], ['custom', 'x']])] });
      el._libraryFields = [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }] }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      rowFor(el, 'tags').querySelector('ew-metadata-multiselect')
        .dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'custom', value: 'x' }]);
    });

    it('does not write to the doc when a field is blurred unchanged', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Keywords', '']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const input = rowFor(el, 'Keywords').querySelector('input[type="text"]');
      input.dispatchEvent(new Event('blur'));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Keywords', value: '' }]);
    });

    it('commits a multiselect change as the comma-joined value', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['tags', 'a']])] });
      el._libraryFields = [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }] }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const multi = rowFor(el, 'tags').querySelector('ew-metadata-multiselect');
      multi.dispatchEvent(new CustomEvent('change', { detail: { value: 'a, b' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'tags', value: 'a, b' }]);
    });

    it('commits a picker change for a color field', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['accent', 'adobe-red']])] });
      el._libraryFields = [{
        key: 'accent',
        label: 'Accent',
        type: 'single',
        values: [{ title: 'Adobe Red', value: 'adobe-red', colorValue: '#FF0000' }, { title: 'Sky', value: 'sky' }],
      }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      rowFor(el, 'accent').querySelector('nx-picker')
        .dispatchEvent(new CustomEvent('change', { detail: { value: 'sky' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'accent', value: 'sky' }]);
    });

    it('commits a json textarea on blur as compact JSON', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['json-ld', '{"@type":"Article"}']])] });
      el._libraryFields = [{ key: 'json-ld', label: 'JSON-LD', type: 'json', values: null }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const textarea = rowFor(el, 'json-ld').querySelector('textarea');
      textarea.value = '{\n  "@type": "Event"\n}';
      textarea.dispatchEvent(new Event('blur'));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'json-ld', value: '{"@type":"Event"}' }]);
    });

    it('saves invalid JSON as typed and flags the field', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['json-ld', '{"@type":"Article"}']])] });
      el._libraryFields = [{ key: 'json-ld', label: 'JSON-LD', type: 'json', values: null }];
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const textarea = rowFor(el, 'json-ld').querySelector('textarea');
      textarea.value = '{\n  broken\n}';
      textarea.dispatchEvent(new Event('blur'));
      await el.updateComplete;

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'json-ld', value: '{ broken }' }]);
      expect(rowFor(el, 'json-ld').classList.contains('nx-field-error')).to.equal(true);
    });

    async function fillAddDialog({ key = '', value = '' } = {}) {
      el.shadowRoot.querySelector('.add-btn').click();
      await el.updateComplete;
      const dialog = el.shadowRoot.querySelector('.ew-pm-add');
      [['key', key], ['value', value]].forEach(([name, text]) => {
        const input = dialog.querySelector(`input[name="${name}"]`);
        input.value = text;
        input.dispatchEvent(new Event('input'));
      });
      return dialog;
    }

    it('adds a new field via the + dialog with just a key, leaving the value empty', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const dialog = await fillAddDialog({ key: 'Keywords' });
      dialog.querySelector('.nx-form-btn-primary').click();
      await el.updateComplete;

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Keywords', value: '' }]);
      expect(el.shadowRoot.querySelector('.ew-pm-add')).to.equal(null);
      expect(rowFor(el, 'Keywords').querySelector('input[type="text"]').value).to.equal('');
      expect(rowFor(el, 'Keywords').querySelector('.delete-btn')).to.exist;
    });

    it('adds a new field with its value via the + dialog', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const dialog = await fillAddDialog({ key: 'Keywords', value: ' foo, bar ' });
      dialog.querySelector('.nx-form-btn-primary').click();
      await el.updateComplete;

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Keywords', value: 'foo, bar' }]);
    });

    it('requires a field name before adding', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const dialog = await fillAddDialog({ key: '  ', value: 'x' });
      dialog.querySelector('.nx-form-btn-primary').click();
      await el.updateComplete;

      const field = dialog.querySelector('input[name="key"]').closest('.nx-form-field');
      expect(field.classList.contains('nx-field-error')).to.equal(true);
      expect(field.querySelector('.nx-input-error-msg').textContent.trim()).to.equal('Field name is required');
      expect(el.shadowRoot.querySelector('.ew-pm-add')).to.exist;
      expect(tableRows(bridge.view)).to.deep.equal([]);
    });

    it('rejects a field name that already exists, ignoring case', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      const dialog = await fillAddDialog({ key: 'title' });
      dialog.querySelector('.nx-form-btn-primary').click();
      await el.updateComplete;

      expect(dialog.querySelector('.nx-input-error-msg').textContent.trim()).to.equal('Field already exists');
      expect(tableRows(bridge.view)).to.deep.equal([]);
    });

    it('clears the field name error while typing', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const dialog = await fillAddDialog();
      dialog.querySelector('.nx-form-btn-primary').click();
      await el.updateComplete;
      const input = dialog.querySelector('input[name="key"]');
      input.value = 'K';
      input.dispatchEvent(new Event('input'));
      await el.updateComplete;

      expect(input.closest('.nx-form-field').classList.contains('nx-field-error')).to.equal(false);
    });

    it('deletes a custom field after confirming the delete dialog', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['legacy-flag', 'yes']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      rowFor(el, 'legacy-flag').querySelector('.delete-btn').click();
      await el.updateComplete;
      const message = el.shadowRoot.querySelector('.ew-pm-delete span').textContent.replace(/\s+/g, ' ').trim();
      expect(message).to.equal('Are you sure you want to remove legacy-flag metadata from the page?');
      el.shadowRoot.querySelector('.ew-pm-delete .nx-form-btn-primary').click();

      expect(tableRows(bridge.view)).to.deep.equal([]);
    });

    it('cancelling the delete dialog leaves the custom field untouched', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['legacy-flag', 'yes']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      rowFor(el, 'legacy-flag').querySelector('.delete-btn').click();
      await el.updateComplete;
      el.shadowRoot.querySelector('.ew-pm-delete .nx-form-btn-secondary').click();
      await el.updateComplete;

      expect(el.shadowRoot.querySelector('.ew-pm-delete')).to.equal(null);
      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'legacy-flag', value: 'yes' }]);
    });
  });

  describe('read-only', () => {
    beforeEach(async () => {
      bridge.view = makeRealView({
        type: 'doc',
        content: [metadataTableJSON([
          ['category', 'news'], ['tags', 'a'], ['json-ld', '{}'], ['note', 'x'], ['custom', 'y'],
        ])],
      });
      bridge.view.setProps({ editable: () => false });
      el._libraryFields = [
        { key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] },
        { key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }] },
        { key: 'json-ld', label: 'JSON-LD', type: 'json', values: null },
        { key: 'note', label: 'Note', type: 'single', values: null },
      ];
      canvasBus.editorDocState.emit();
      await el.updateComplete;
    });

    it('hides the add and delete buttons', () => {
      expect(!!el.shadowRoot.querySelector('.add-btn')).to.equal(false);
      expect(!!el.shadowRoot.querySelector('.delete-btn')).to.equal(false);
    });

    it('makes all field controls read-only', () => {
      expect(rowFor(el, 'note').querySelector('input[type="text"]').readOnly).to.equal(true);
      expect(rowFor(el, 'custom').querySelector('input[type="text"]').readOnly).to.equal(true);
      expect(rowFor(el, 'json-ld').querySelector('textarea').readOnly).to.equal(true);
      expect(rowFor(el, 'tags').querySelector('ew-metadata-multiselect').disabled).to.equal(true);
      expect(rowFor(el, 'category').querySelector('nx-picker').hasAttribute('inert')).to.equal(true);
    });

    it('does not write changes to the doc', () => {
      rowFor(el, 'category').querySelector('nx-picker')
        .dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));
      expect(tableRows(bridge.view)[0]).to.deep.equal({ key: 'category', value: 'news' });
    });
  });

  describe('sync with external doc changes', () => {
    // Walk the doc by nodeSize, like production code, independent of the helpers above.
    function findTablePos(view) {
      let tablePos = -1;
      view.state.doc.descendants((n, p) => { if (n.type.name === 'table' && tablePos < 0) tablePos = p; });
      return tablePos;
    }

    function textStartPos(table, tablePos, rowIndex, cellIndex) {
      let pos = tablePos + 1;
      for (let i = 0; i < rowIndex; i += 1) pos += table.child(i).nodeSize;
      pos += 1;
      const row = table.child(rowIndex);
      for (let i = 0; i < cellIndex; i += 1) pos += row.child(i).nodeSize;
      return pos + 2;
    }

    it('refreshes on a plain in-place text edit within an existing cell, not just structural changes', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'Old']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('Old');

      // Simulate typing into the value cell: a plain text replace, no row change.
      const { view } = bridge;
      const tablePos = findTablePos(view);
      const table = view.state.doc.nodeAt(tablePos);
      const from = textStartPos(table, tablePos, 1, 1);
      view.dispatch(view.state.tr.insertText('New', from, from + 'Old'.length));
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('New');
    });

    it('does not show a field for a freshly-added row until it has a key', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
      canvasBus.editorDocState.emit();
      await el.updateComplete;
      const fieldCountBefore = el.shadowRoot.querySelectorAll('.ew-pm-row').length;

      const { view } = bridge;
      const tablePos = findTablePos(view);
      const table = view.state.doc.nodeAt(tablePos);
      const { schema } = view.state;
      const emptyCell = () => schema.nodes.table_cell.create(null, schema.nodes.paragraph.create());
      const emptyRow = schema.nodes.table_row.create(null, [emptyCell(), emptyCell()]);
      view.dispatch(view.state.tr.insert(tablePos + table.nodeSize - 1, emptyRow));
      canvasBus.editorDocState.emit();
      await el.updateComplete;

      expect(el.shadowRoot.querySelectorAll('.ew-pm-row').length).to.equal(fieldCountBefore);
    });
  });
});
