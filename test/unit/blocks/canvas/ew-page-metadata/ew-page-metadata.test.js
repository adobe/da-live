/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { TextSelection } from 'da-y-wrapper';
import { getNx2, setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getExtensionsBridge;
let findMetadataImage;
let readMetadataRows;
let setRepositoryConfig;
let setSelection;

before(async () => {
  await import('../../../../../blocks/canvas/ew-page-metadata/ew-page-metadata.js');
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
  ({ findMetadataImage, readMetadataRows } = await import('../../../../../blocks/canvas/editor-utils/metadata.js'));
  // Same module URLs as aem-assets.js imports, so the fixtures share their state.
  ({ setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`));
  ({ setSelection } = await import(`${getNx2()}/utils/aem-assets/selection.js`));
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

  // Loads a doc with these metadata rows (none: a plain paragraph) and optional library config.
  async function loadDoc(rows, libraryFields) {
    bridge.view = makeRealView(rows ? { type: 'doc', content: [metadataTableJSON(rows)] } : baseDoc());
    if (libraryFields) el._libraryFields = libraryFields;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
  }

  describe('panel chrome', () => {
    it('shows "Page Metadata" as the panel headline', async () => {
      expect(el.shadowRoot.querySelector('h3').textContent).to.equal('Page Metadata');
    });

    it('uses NX form/button styles for inputs and icon buttons', async () => {
      await loadDoc([['custom', 'x']]);
      const row = rowFor(el, 'custom');
      const addBtn = el.shadowRoot.querySelector('.add-btn');
      expect(row.classList.contains('nx-form-field')).to.equal(true);
      expect(row.querySelector('input[type="text"]').classList.contains('nx-input')).to.equal(true);
      expect(row.querySelector('.delete-btn').classList.contains('nx-action-btn-icon')).to.equal(true);
      expect(addBtn.classList.contains('nx-action-btn-icon')).to.equal(true);
      expect(addBtn.getAttribute('aria-label')).to.equal('Add page metadata field');
    });

    it('renders the add-field dialog with its copy and NX inputs', async () => {
      await loadDoc();
      el.shadowRoot.querySelector('.add-btn').click();
      await el.updateComplete;
      const dialog = el.shadowRoot.querySelector('.ew-pm-add');
      const [keyLabel, valueLabel] = dialog.querySelectorAll('.nx-form-field > span:first-child');
      expect(dialog.getAttribute('title')).to.equal('Add page metadata field');
      expect(keyLabel.textContent.replace(/\s+/g, '')).to.equal('Fieldname*');
      expect(dialog.querySelector('input[name="key"]').required).to.equal(true);
      expect(valueLabel.textContent.trim()).to.equal('Value');
      expect(dialog.querySelector('input[name="value"]').classList.contains('nx-input')).to.equal(true);
    });
  });

  describe('fallback + read path', () => {
    it('connects each field label to its text control', async () => {
      await loadDoc([['og image', 'x']], [
        { key: 'Title', label: 'Page Title', type: 'single', values: null },
        { key: 'JSON-LD', label: 'JSON-LD', type: 'json', values: null },
      ]);
      const labelOf = (control) => control.labels[0]?.textContent.trim();
      expect(labelOf(rowFor(el, 'Title').querySelector('input'))).to.equal('Page Title');
      expect(labelOf(rowFor(el, 'JSON-LD').querySelector('textarea'))).to.equal('JSON-LD');
      expect(rowFor(el, 'og image').querySelector('input').id).to.equal('ew-pm-og-image');
    });

    it('passes the field label to the multiselect', async () => {
      await loadDoc(undefined, [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }] }]);
      expect(rowFor(el, 'tags').querySelector('ew-metadata-multiselect').label).to.equal('Tags');
    });
    it('reads the doc rows when opened after the doc has loaded', async () => {
      bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['title', 'My Page']])] });
      const lateEl = await createPanel();
      expect(rowFor(lateEl, 'Title').querySelector('input[type="text"]').value).to.equal('My Page');
      lateEl.remove();
    });

    it('gives text fields an id from their lowercased key', async () => {
      await loadDoc([['Legacy-Flag', 'yes']]);
      const ids = [...el.shadowRoot.querySelectorAll('.ew-pm-control input[type="text"]')]
        .map((input) => input.id);
      expect(ids).to.deep.equal(['ew-pm-title', 'ew-pm-description', 'ew-pm-legacy-flag']);

      el._libraryFields = [
        { key: 'Robots', label: 'Robots', type: 'single', values: null },
        { key: 'JSON-LD', label: 'JSON-LD', type: 'json', values: null },
      ];
      await el.updateComplete;
      expect(rowFor(el, 'Robots').querySelector('input').id).to.equal('ew-pm-robots');
      expect(rowFor(el, 'JSON-LD').querySelector('textarea').id).to.equal('ew-pm-json-ld');
    });
    it('renders default Title/Description text fields when there is no library config', async () => {
      await loadDoc();
      ['Title', 'Description'].forEach((key) => {
        expect(rowFor(el, key).querySelector('input[type="text"]').value).to.equal('');
      });
    });

    it('renders unconfigured doc keys alongside fallback fields when there is no library config', async () => {
      await loadDoc([['legacy-flag', 'yes']]);
      expect(rowFor(el, 'legacy-flag').querySelector('input[type="text"]').value).to.equal('yes');
      expect(rowFor(el, 'Title')).to.exist;
      expect(rowFor(el, 'Description')).to.exist;
    });

    it('renders configured fields plus unconfigured doc keys when library config is present', async () => {
      await loadDoc(
        [['category', 'news'], ['legacy-flag', 'yes']],
        [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }],
      );

      expect(rowFor(el, 'category').querySelector('nx-picker')).to.exist;
      expect(rowFor(el, 'legacy-flag').querySelector('input[type="text"]').value).to.equal('yes');
    });

    it('pre-fills from the doc, and clears when editorHtmlState signals the doc was unloaded', async () => {
      await loadDoc([['title', 'My Page']]);
      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('My Page');

      canvasBus.editorHtmlState.emit('');
      await el.updateComplete;
      expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('');
    });
  });

  describe('config-driven rendering', () => {
    it('renders a single-select dropdown with a leading empty option', async () => {
      await loadDoc([['category', 'news']], [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }]);
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
      await loadDoc([['tags', 'a, b']], [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }] }]);
      const multi = rowFor(el, 'tags').querySelector('ew-metadata-multiselect');
      expect(multi).to.exist;
      expect(multi.value).to.equal('a, b');
    });

    it('renders color fields as a picker with swatches', async () => {
      await loadDoc([['accent', 'adobe-red']], [{
        key: 'accent',
        label: 'Accent',
        type: 'single',
        values: [{ title: 'Adobe Red', value: 'adobe-red', colorValue: '#FF0000' }, { title: 'Sky', value: 'sky' }],
      }]);
      const picker = rowFor(el, 'accent').querySelector('nx-picker');
      expect(picker.value).to.equal('adobe-red');
      expect(picker.items).to.deep.equal([
        { value: '', label: 'None' },
        { value: 'adobe-red', label: 'Adobe Red', swatch: '#FF0000' },
        { value: 'sky', label: 'Sky' },
      ]);
    });

    it('renders a json field as a textarea with pretty-printed JSON', async () => {
      await loadDoc([['json-ld', '{"@type":"Article"}']], [{ key: 'json-ld', label: 'JSON-LD', type: 'json', values: null }]);
      const textarea = rowFor(el, 'json-ld').querySelector('textarea');
      expect(textarea.classList.contains('nx-input')).to.equal(true);
      expect(textarea.value).to.equal('{\n  "@type": "Article"\n}');
    });

    it('flags a json field holding invalid JSON with an error message', async () => {
      await loadDoc([['json-ld', '{broken']], [{ key: 'json-ld', label: 'JSON-LD', type: 'json', values: null }]);
      const row = rowFor(el, 'json-ld');
      expect(row.classList.contains('nx-field-error')).to.equal(true);
      expect(row.querySelector('.nx-input-error-msg').textContent.trim()).to.equal('Invalid JSON');
    });

    it('selects the empty option when the field has no current value', async () => {
      await loadDoc(undefined, [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }]);
      const picker = rowFor(el, 'category').querySelector('nx-picker');
      expect(picker.value).to.equal('');
    });
  });

  describe('write-back', () => {
    it('creates the metadata table and commits a value on text-field blur when none exists yet', async () => {
      await loadDoc();

      const input = rowFor(el, 'Title').querySelector('input[type="text"]');
      input.value = 'Brand new';
      input.dispatchEvent(new Event('blur'));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Title', value: 'Brand new' }]);
    });

    it('commits a picker change to the existing row', async () => {
      await loadDoc([['category', 'news']], [{
        key: 'category',
        label: 'Category',
        type: 'single',
        values: [{ title: 'News', value: 'news' }, { title: 'Blog', value: 'blog' }],
      }]);

      const picker = rowFor(el, 'category').querySelector('nx-picker');
      picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'blog' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'category', value: 'blog' }]);
    });

    it('removes the row when the empty option is selected', async () => {
      await loadDoc([['category', 'news'], ['custom', 'x']], [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }]);

      const picker = rowFor(el, 'category').querySelector('nx-picker');
      picker.dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'custom', value: 'x' }]);
    });

    it('removes the row when a text field is emptied', async () => {
      await loadDoc([['Title', 'My Page'], ['Description', 'Desc']]);

      const input = rowFor(el, 'Title').querySelector('input[type="text"]');
      input.value = '   ';
      input.dispatchEvent(new Event('blur'));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Description', value: 'Desc' }]);
    });

    it('removes the row when all multiselect values are cleared', async () => {
      await loadDoc([['tags', 'a'], ['custom', 'x']], [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }] }]);

      rowFor(el, 'tags').querySelector('ew-metadata-multiselect')
        .dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'custom', value: 'x' }]);
    });

    it('keeps an empty field when it is blurred unchanged', async () => {
      await loadDoc([['Keywords', '']]);

      const input = rowFor(el, 'Keywords').querySelector('input[type="text"]');
      input.dispatchEvent(new Event('blur'));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Keywords', value: '' }]);
    });

    it('commits a multiselect change as the comma-joined value', async () => {
      await loadDoc([['tags', 'a']], [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }] }]);

      const multi = rowFor(el, 'tags').querySelector('ew-metadata-multiselect');
      multi.dispatchEvent(new CustomEvent('change', { detail: { value: 'a, b' } }));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'tags', value: 'a, b' }]);
    });

    it('commits a json textarea on blur as compact JSON', async () => {
      await loadDoc([['json-ld', '{"@type":"Article"}']], [{ key: 'json-ld', label: 'JSON-LD', type: 'json', values: null }]);

      const textarea = rowFor(el, 'json-ld').querySelector('textarea');
      textarea.value = '{\n  "@type": "Event"\n}';
      textarea.dispatchEvent(new Event('blur'));

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'json-ld', value: '{"@type":"Event"}' }]);
    });

    it('saves invalid JSON as typed and flags the field', async () => {
      await loadDoc([['json-ld', '{"@type":"Article"}']], [{ key: 'json-ld', label: 'JSON-LD', type: 'json', values: null }]);

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
      await loadDoc();

      const dialog = await fillAddDialog({ key: 'Keywords' });
      dialog.querySelector('.nx-form-btn-primary').click();
      await el.updateComplete;

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Keywords', value: '' }]);
      expect(rowFor(el, 'Keywords').querySelector('input[type="text"]').value).to.equal('');
      expect(rowFor(el, 'Keywords').querySelector('.delete-btn')).to.exist;
    });

    it('adds a new field with its value via the + dialog', async () => {
      await loadDoc();

      const dialog = await fillAddDialog({ key: 'Keywords', value: ' foo, bar ' });
      dialog.querySelector('.nx-form-btn-primary').click();
      await el.updateComplete;

      expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Keywords', value: 'foo, bar' }]);
    });

    it('requires a field name before adding', async () => {
      await loadDoc();

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
      await loadDoc();

      const dialog = await fillAddDialog({ key: 'title' });
      dialog.querySelector('.nx-form-btn-primary').click();
      await el.updateComplete;

      expect(dialog.querySelector('.nx-input-error-msg').textContent.trim()).to.equal('Field already exists');
      expect(tableRows(bridge.view)).to.deep.equal([]);
    });

    it('deletes a custom field after confirming the delete dialog', async () => {
      await loadDoc([['legacy-flag', 'yes']]);

      rowFor(el, 'legacy-flag').querySelector('.delete-btn').click();
      await el.updateComplete;
      const message = el.shadowRoot.querySelector('.ew-pm-delete span').textContent.replace(/\s+/g, ' ').trim();
      expect(message).to.equal('Are you sure you want to remove legacy-flag metadata from the page?');
      el.shadowRoot.querySelector('.ew-pm-delete .nx-form-btn-primary').click();

      expect(tableRows(bridge.view)).to.deep.equal([]);
    });

    it('cancelling the delete dialog leaves the custom field untouched', async () => {
      await loadDoc([['legacy-flag', 'yes']]);

      rowFor(el, 'legacy-flag').querySelector('.delete-btn').click();
      await el.updateComplete;
      el.shadowRoot.querySelector('.ew-pm-delete .nx-form-btn-secondary').click();
      await el.updateComplete;

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

    it('makes all field controls read-only', () => {
      expect(rowFor(el, 'note').querySelector('input[type="text"]').readOnly).to.equal(true);
      expect(rowFor(el, 'custom').querySelector('input[type="text"]').readOnly).to.equal(true);
      expect(rowFor(el, 'json-ld').querySelector('textarea').readOnly).to.equal(true);
      expect(rowFor(el, 'tags').querySelector('ew-metadata-multiselect').disabled).to.equal(true);
      expect(rowFor(el, 'category').querySelector('nx-picker').hasAttribute('inert')).to.equal(true);
    });

    it('keeps the doc unchanged when a field changes', () => {
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
      await loadDoc([['Title', 'Old']]);
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
  });

  describe('image fields', () => {
    const SOURCE_URL = 'https://admin.da.live/source/imgorg/imgsite/dir/page.html';
    const IMAGE_FIELD = { key: 'image', label: 'Image', type: 'image', values: null };
    const png = () => new File(['image'], 'new.png', { type: 'image/png' });
    let fetchStub;

    function imageDoc(rows = [['Title', 'My Page']], attrs = { src: '/current.png', alt: 'Current alt' }) {
      const table = metadataTableJSON(rows);
      const cell = (content) => ({ type: 'table_cell', attrs: { colspan: 1 }, content: [{ type: 'paragraph', content }] });
      table.content.push({
        type: 'table_row',
        content: [cell([{ type: 'text', text: 'Image' }]), cell([{ type: 'image', attrs }])],
      });
      return { type: 'doc', content: [table] };
    }

    async function loadImageDoc(json, libraryFields) {
      bridge.view = makeRealView(json ?? imageDoc());
      bridge.sourceUrl = SOURCE_URL;
      if (libraryFields) el._libraryFields = libraryFields;
      canvasBus.editorDocState.emit();
      await el.updateComplete;
    }

    const field = (key) => el._fields.find((f) => f.key.toLowerCase() === key.toLowerCase());
    const imageRow = () => rowFor(el, 'Image') ?? rowFor(el, 'image');

    beforeEach(() => {
      fetchStub = sinon.stub(window, 'fetch').callsFake(async (url, opts) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        if (opts?.method === 'POST') {
          return new Response(JSON.stringify({ source: { contentUrl: './media_new.png' } }), { status: 201 });
        }
        return new Response('{}');
      });
      setRepositoryConfig(null);
    });

    afterEach(() => {
      sinon.restore();
      bridge.sourceUrl = null;
      setRepositoryConfig(null);
      setSelection({});
      delete window.PureJSSelectors;
      setNx('/test/fixtures/nx', { hostname: 'example.com' });
    });

    it('shows a page image as a preview with Replace image instead of a text input', async () => {
      await loadImageDoc();
      const row = imageRow();
      const img = row.querySelector('img.ew-pm-image-preview');
      expect(new URL(img.src).pathname).to.equal('/current.png');
      expect(img.alt).to.equal('Current alt');
      expect(row.querySelector('input, textarea')).to.equal(null);
      expect(row.querySelector('button.nx-form-btn-secondary').textContent.trim()).to.equal('Replace image');
      expect(row.querySelector('label').hasAttribute('for')).to.equal(false);
    });

    it('offers Add image for a configured image field without an image', async () => {
      await loadImageDoc({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] }, [IMAGE_FIELD]);
      const row = rowFor(el, 'image');
      expect(row.querySelector('img')).to.equal(null);
      expect(row.querySelector('.ew-pm-image-empty').textContent).to.equal('No image');
      expect(row.querySelector('button').textContent.trim()).to.equal('Add image');
    });

    it('opens an image file picker from the button when AEM Assets is not configured', async () => {
      await loadImageDoc();
      const input = document.createElement('input');
      input.click = sinon.spy();
      const create = sinon.stub(document, 'createElement').callThrough();
      create.withArgs('input').returns(input);
      imageRow().querySelector('button').click();
      create.restore();
      expect(input.type).to.equal('file');
      expect(input.accept).to.equal('image/svg+xml,image/png,image/jpeg,image/gif,image/avif,image/webp');
      expect(input.click.calledOnce).to.equal(true);
    });

    it('uploads a replacement next to the page and keeps the image attributes', async () => {
      await loadImageDoc();
      const target = el._captureImageTarget(field('Image'));
      await el._uploadImage(field('Image'), target, png());
      await el.updateComplete;
      const upload = fetchStub.getCalls().find((call) => call.args[1]?.method === 'POST');
      expect(String(upload.args[0])).to.include('/imgorg/imgsite/dir/.page/new.png');
      const { node } = findMetadataImage(bridge.view, 'Image');
      expect(node.attrs).to.include({ src: './media_new.png', alt: 'Current alt' });
      expect(field('Image').value).to.equal('./media_new.png');
      expect(el._uploadingKey).to.equal(null);
    });

    it('uploads the first image into an empty configured field', async () => {
      await loadImageDoc({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] }, [IMAGE_FIELD]);
      await el._uploadImage(field('image'), el._captureImageTarget(field('image')), png());
      await el.updateComplete;
      expect(readMetadataRows(bridge.view).map((row) => [row.key, row.image?.src])).to.deep.equal([
        ['Title', undefined], ['image', './media_new.png'],
      ]);
      expect(rowFor(el, 'image').querySelector('button').textContent.trim()).to.equal('Replace image');
    });

    it('keeps the image and shows upload failures', async () => {
      await loadImageDoc();
      const before = findMetadataImage(bridge.view, 'Image').node;
      fetchStub.callsFake(async () => new Response('Failed', { status: 500 }));
      await el._uploadImage(field('Image'), el._captureImageTarget(field('Image')), png());
      await el.updateComplete;
      expect(findMetadataImage(bridge.view, 'Image').node).to.equal(before);
      expect(imageRow().querySelector('[role="alert"]').textContent).to.include('500');
      expect(el._uploadingKey).to.equal(null);
    });

    it('reports a missing upload context and unsupported file types', async () => {
      await loadImageDoc();
      bridge.sourceUrl = null;
      await el._uploadImage(field('Image'), el._captureImageTarget(field('Image')), png());
      expect(el._imageError.message).to.include('source is unavailable');
      bridge.sourceUrl = SOURCE_URL;
      const text = new File(['text'], 'file.txt', { type: 'text/plain' });
      await el._uploadImage(field('Image'), el._captureImageTarget(field('Image')), text);
      expect(el._imageError.message).to.include('SVG, PNG, JPEG, GIF, AVIF or WebP');
      expect(fetchStub.getCalls().some((call) => call.args[1]?.method === 'POST')).to.equal(false);
    });

    [false, true].forEach((navigate) => {
      it(`does not apply an upload after ${navigate ? 'navigation' : 'a concurrent image change'}`, async () => {
        await loadImageDoc();
        const { view } = bridge;
        const target = el._captureImageTarget(field('Image'));
        let finish;
        let start;
        const started = new Promise((resolve) => { start = resolve; });
        fetchStub.callsFake(async () => new Promise((resolve) => {
          finish = resolve;
          start();
        }));
        const uploading = el._uploadImage(field('Image'), target, png());
        await started;
        if (navigate) bridge.view = null;
        else {
          const { pos, node } = findMetadataImage(view, 'Image');
          view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, src: '/other.png' }));
        }
        finish(new Response(JSON.stringify({ source: { contentUrl: './media_stale.png' } }), { status: 201 }));
        await uploading;
        expect(findMetadataImage(view, 'Image').node.attrs.src).to.equal(navigate ? '/current.png' : '/other.png');
      });
    });

    it('disables image changes without write access', async () => {
      await loadImageDoc();
      bridge.view.setProps({ editable: () => false });
      canvasBus.editorDocState.emit();
      el.requestUpdate();
      await el.updateComplete;
      expect(imageRow().querySelector('button').disabled).to.equal(true);
      expect(el._captureImageTarget(field('Image'))).to.equal(null);
    });

    describe('AEM Assets', () => {
      const asset = { 'aem:formatName': 'png', path: '/content/dam/new.png' };
      const ASSET_SRC = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/new/as/new.avif';

      async function openAssets(key) {
        let selector;
        const renderAssetSelector = (container, props) => { selector = props; };
        window.PureJSSelectors = { renderAssetSelector };
        const append = document.head.append.bind(document.head);
        sinon.stub(document.head, 'append').callsFake((...nodes) => {
          if (nodes[0].tagName === 'SCRIPT') nodes[0].dispatchEvent(new Event('load'));
          else append(...nodes);
        });
        setNx('/test/fixtures/nx2', { hostname: 'example.com' });
        await el._openImageAssets(field(key));
        expect(selector, el._imageError?.message).not.to.equal(undefined);
        return selector;
      }

      beforeEach(async () => {
        setRepositoryConfig({ repositoryId: 'delivery-p1-e1.adobeaemcloud.com' });
        setSelection({ href: ASSET_SRC, isImage: true, alt: 'Asset alt' });
        el._hashState = { org: 'imgorg', site: 'imgsite' };
        await el._loadAssetsConfig();
      });

      it('offers Upload and AEM Assets when the site has an assets repository', async () => {
        await loadImageDoc();
        const menu = imageRow().querySelector('nx-menu');
        expect(el._hasAemAssets).to.equal(true);
        expect(menu.items).to.deep.equal([{ id: 'upload', label: 'Upload' }, { id: 'aem-assets', label: 'AEM Assets' }]);
        const upload = sinon.stub(el, '_triggerImageUpload');
        const assets = sinon.stub(el, '_openImageAssets');
        menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'upload' } }));
        menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'aem-assets' } }));
        expect(upload.calledOnce).to.equal(true);
        expect(assets.calledOnce).to.equal(true);
      });

      it('replaces the row image with the selected asset, wherever the cursor is', async () => {
        await loadImageDoc();
        const selector = await openAssets('Image');
        const { view } = bridge;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
        await selector.handleSelection([asset]);
        canvasBus.editorDocState.emit();
        await el.updateComplete;
        const { node } = findMetadataImage(view, 'Image');
        expect(node.attrs).to.include({ src: ASSET_SRC, alt: 'Asset alt' });
        expect(readMetadataRows(view)[0]).to.deep.equal({ key: 'Title', value: 'My Page' });
        expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
      });

      it('fills an empty configured image field with the selected asset', async () => {
        await loadImageDoc({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] }, [IMAGE_FIELD]);
        const selector = await openAssets('image');
        await selector.handleSelection([asset]);
        expect(findMetadataImage(bridge.view, 'image').node.attrs.src).to.equal(ASSET_SRC);
      });

      it('ignores a selection after the dialog is closed', async () => {
        await loadImageDoc();
        const selector = await openAssets('Image');
        el.shadowRoot.querySelector('nx-dialog').dispatchEvent(new Event('close'));
        const { doc } = bridge.view.state;
        await selector.handleSelection([asset]);
        expect(bridge.view.state.doc).to.equal(doc);
      });
    });
  });
});
