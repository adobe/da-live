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

  describe('fallback + read path', () => {
    it('renders default Title/Description text fields when there is no library config', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;
      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('');
      expect(rowFor(el, 'Description').querySelector('input[type="text"]').value).to.equal('');
    });

    it('pre-fills default fields from the current doc metadata', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['title', 'My Page']])] });
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;
      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('My Page');
    });

    it('renders an unconfigured doc key as a plain text field', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['legacy-flag', 'yes']])] });
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;
      expect(rowFor(el, 'legacy-flag').querySelector('input[type="text"]').value).to.equal('yes');
    });

    it('renders both configured and unconfigured fields together, the latter as plain text', async () => {
      bridge.view = makeRealView({
        type: 'doc',
        content: [metadataTableJSON([['category', 'news'], ['legacy-flag', 'yes']])],
      });
      el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      expect(rowFor(el, 'category').querySelector('nx-picker')).to.exist;
      expect(rowFor(el, 'legacy-flag').querySelector('input[type="text"]').value).to.equal('yes');
    });

    it('shows the add-field button even when fields are configured', async () => {
      expect(el.shadowRoot.querySelector('.add-btn')).to.exist;
    });

    it('shows "Page Metadata" as the panel headline', async () => {
      expect(el.shadowRoot.querySelector('h3').textContent).to.equal('Page Metadata');
    });
  });

  describe('config-driven rendering', () => {
    it('renders a single-select dropdown with a leading empty option', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['category', 'news']])] });
      el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;
      const picker = rowFor(el, 'category').querySelector('nx-picker');
      expect(picker).to.exist;
      expect(picker.value).to.equal('news');
      expect(picker.items).to.deep.equal([
        { value: '', label: '—' },
        { value: 'news', label: 'News' },
      ]);
    });

    it('renders ew-metadata-multiselect for a multi-select field', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['tags', 'a, b']])] });
      el._libraryFields = [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }] }];
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;
      const multi = rowFor(el, 'tags').querySelector('ew-metadata-multiselect');
      expect(multi).to.exist;
      expect(multi.value).to.equal('a, b');
    });

    it('renders swatch radios, including a leading empty option, for a field with color values', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['accent', 'adobe-red']])] });
      el._libraryFields = [{
        key: 'accent',
        label: 'Accent',
        type: 'single',
        values: [{ title: 'Adobe Red', value: 'adobe-red', colorValue: '#FF0000' }, { title: 'Sky', value: 'sky' }],
      }];
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;
      const row = rowFor(el, 'accent');
      expect(row.querySelector('.swatch')).to.exist;
      expect(row.querySelector('input[type="radio"][value=""]')).to.exist;
      expect(row.querySelector('input[type="radio"][value="adobe-red"]').checked).to.equal(true);
    });

    it('selects the empty option when the field has no current value', async () => {
      bridge.view = makeRealView(baseDoc());
      el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;
      const picker = rowFor(el, 'category').querySelector('nx-picker');
      expect(picker.value).to.equal('');
    });
  });

  describe('write-back', () => {
    it('creates the metadata table and commits a value on text-field blur when none exists yet', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorHtmlState.emit('x');
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
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      const picker = rowFor(el, 'category').querySelector('nx-picker');
      picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'blog' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'category', value: 'blog' }]);
    });

    it('commits the empty option, clearing the value', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['category', 'news']])] });
      el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      const picker = rowFor(el, 'category').querySelector('nx-picker');
      picker.dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'category', value: '' }]);
    });

    it('commits a multiselect change as the comma-joined value', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['tags', 'a']])] });
      el._libraryFields = [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }] }];
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      const multi = rowFor(el, 'tags').querySelector('ew-metadata-multiselect');
      multi.dispatchEvent(new CustomEvent('change', { detail: { value: 'a, b' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'tags', value: 'a, b' }]);
    });

    it('commits a swatch-radio click', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['accent', 'adobe-red']])] });
      el._libraryFields = [{
        key: 'accent',
        label: 'Accent',
        type: 'single',
        values: [{ title: 'Adobe Red', value: 'adobe-red', colorValue: '#FF0000' }, { title: 'Sky', value: 'sky' }],
      }];
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      rowFor(el, 'accent').querySelector('input[type="radio"][value="sky"]').click();

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'accent', value: 'sky' }]);
    });

    it('adds a new field via the + dialog with just a key, leaving the value empty', async () => {
      bridge.view = makeRealView(baseDoc());
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      el.shadowRoot.querySelector('.add-btn').click();
      await el.updateComplete;
      const dialog = el.shadowRoot.querySelector('.ew-pm-add');
      expect(dialog).to.exist;
      expect(dialog.querySelector('input[name="value"]')).to.equal(null);

      dialog.querySelector('input[name="key"]').value = 'Keywords';
      dialog.querySelector('input[name="key"]').dispatchEvent(new Event('input'));
      dialog.querySelector('.da-btn-primary').click();
      await el.updateComplete;

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Keywords', value: '' }]);
      expect(el.shadowRoot.querySelector('.ew-pm-add')).to.equal(null);
      expect(rowFor(el, 'Keywords').querySelector('input[type="text"]').value).to.equal('');
    });

    it('deletes a field after confirming the delete dialog', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      rowFor(el, 'Title').querySelector('.delete-btn').click();
      await el.updateComplete;
      el.shadowRoot.querySelector('.ew-pm-delete .da-btn-primary').click();

      expect(tableRows(bridge.view)).to.deep.equal([]);
    });

    it('cancelling the delete dialog leaves the field untouched', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      rowFor(el, 'Title').querySelector('.delete-btn').click();
      await el.updateComplete;
      el.shadowRoot.querySelector('.ew-pm-delete .da-btn-secondary').click();
      await el.updateComplete;

      expect(el.shadowRoot.querySelector('.ew-pm-delete')).to.equal(null);
      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Title', value: 'My Page' }]);
    });
  });

  describe('sync with external doc changes', () => {
    it('refreshes when the metadata block is edited outside the panel (e.g. direct block edit)', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'Old']])] });
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;
      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('Old');

      // Simulate an edit made through a different path (e.g. the raw block-edit modal),
      // which also ends by re-emitting editorHtmlState after dispatching its transaction.
      const { view } = bridge;
      const { schema } = view.state;
      let tablePos = -1;
      view.state.doc.descendants((n, p) => { if (n.type.name === 'table' && tablePos < 0) tablePos = p; });
      const table = view.state.doc.nodeAt(tablePos);
      const rowPos = tablePos + 1 + table.child(0).nodeSize;
      const rowNode = table.child(1);
      const cell = (text) => schema.nodes.table_cell.create(
        null,
        schema.nodes.paragraph.create(null, schema.text(text)),
      );
      const newRow = schema.nodes.table_row.create(null, [cell('Title'), cell('New')]);
      view.dispatch(view.state.tr.replaceWith(rowPos, rowPos + rowNode.nodeSize, newRow));
      canvasBus.editorHtmlState.emit('x');
      await el.updateComplete;

      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('New');
    });
  });
});
