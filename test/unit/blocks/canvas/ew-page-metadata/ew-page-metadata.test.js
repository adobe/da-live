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

function metadataHtml(rows) {
  const body = rows.map(([k, v]) => `<div><div>${k}</div><div>${v}</div></div>`).join('');
  return `<main><div><div class="metadata">${body}</div></div></main>`;
}

function rowFor(el, key) {
  return el.shadowRoot.querySelector(`.ew-pm-row[data-key="${key}"]`);
}

// Direct doc inspection — getInstrumentedHTML's block conversion looks for
// `.tableWrapper > table`, a DOM wrapper only present with the real editor's table
// plugins, so a bare test view's tables never round-trip through that pipeline.
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

describe('ew-page-metadata — fallback + read path', () => {
  let el;

  afterEach(() => {
    el?.remove();
    canvasBus.editorHtmlState.emit('');
  });

  it('renders default Title/Description text fields when there is no library config', async () => {
    el = await createPanel();
    canvasBus.editorHtmlState.emit(metadataHtml([]));
    await el.updateComplete;
    expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('');
    expect(rowFor(el, 'Description').querySelector('input[type="text"]').value).to.equal('');
  });

  it('pre-fills default fields from the current doc metadata', async () => {
    el = await createPanel();
    canvasBus.editorHtmlState.emit(metadataHtml([['title', 'My Page']]));
    await el.updateComplete;
    expect(rowFor(el, 'Title').querySelector('input[type="text"]').value).to.equal('My Page');
  });

  it('renders an unconfigured doc key as a plain text field', async () => {
    el = await createPanel();
    canvasBus.editorHtmlState.emit(metadataHtml([['legacy-flag', 'yes']]));
    await el.updateComplete;
    expect(rowFor(el, 'legacy-flag').querySelector('input[type="text"]').value).to.equal('yes');
  });

  it('shows the add-field button even when fields are configured', async () => {
    el = await createPanel();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.add-btn')).to.exist;
  });
});

describe('ew-page-metadata — config-driven rendering', () => {
  let el;

  afterEach(() => {
    el?.remove();
    canvasBus.editorHtmlState.emit('');
  });

  it('renders a single-select dropdown for a configured field with plain values', async () => {
    el = await createPanel();
    el._libraryFields = [{ key: 'category', label: 'Category', type: 'single', values: [{ title: 'News', value: 'news' }] }];
    canvasBus.editorHtmlState.emit(metadataHtml([['category', 'news']]));
    await el.updateComplete;
    const picker = rowFor(el, 'category').querySelector('nx-picker');
    expect(picker).to.exist;
    expect(picker.value).to.equal('news');
    expect(picker.items).to.deep.equal([{ value: 'news', label: 'News' }]);
  });

  it('renders ew-metadata-multiselect for a multi-select field', async () => {
    el = await createPanel();
    el._libraryFields = [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }] }];
    canvasBus.editorHtmlState.emit(metadataHtml([['tags', 'a, b']]));
    await el.updateComplete;
    const multi = rowFor(el, 'tags').querySelector('ew-metadata-multiselect');
    expect(multi).to.exist;
    expect(multi.value).to.equal('a, b');
  });

  it('renders swatch radios for a single-select field with color values', async () => {
    el = await createPanel();
    el._libraryFields = [{
      key: 'accent',
      label: 'Accent',
      type: 'single',
      values: [{ title: 'Adobe Red', value: 'adobe-red', colorValue: '#FF0000' }, { title: 'Sky', value: 'sky' }],
    }];
    canvasBus.editorHtmlState.emit(metadataHtml([['accent', 'adobe-red']]));
    await el.updateComplete;
    const row = rowFor(el, 'accent');
    expect(row.querySelector('.swatch')).to.exist;
    expect(row.querySelector('input[type="radio"][value="adobe-red"]').checked).to.equal(true);
  });
});

describe('ew-page-metadata — write-back', () => {
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

  it('creates the metadata table and commits a value on text-field blur when none exists yet', async () => {
    bridge.view = makeRealView(baseDoc());
    canvasBus.editorHtmlState.emit(metadataHtml([]));
    await el.updateComplete;

    const input = rowFor(el, 'Title').querySelector('input[type="text"]');
    input.value = 'Brand new';
    input.dispatchEvent(new Event('blur'));

    expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Title', value: 'Brand new' }]);
  });

  it('commits a picker change to the existing row', async () => {
    bridge.view = makeRealView(baseDoc());
    canvasBus.editorHtmlState.emit(metadataHtml([['category', 'news']]));
    el._libraryFields = [{
      key: 'category',
      label: 'Category',
      type: 'single',
      values: [{ title: 'News', value: 'news' }, { title: 'Blog', value: 'blog' }],
    }];
    await el.updateComplete;

    const picker = rowFor(el, 'category').querySelector('nx-picker');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'blog' } }));

    expect(tableRows(bridge.view)).to.deep.equal([{ key: 'category', value: 'blog' }]);
  });

  it('commits a multiselect change as the comma-joined value', async () => {
    bridge.view = makeRealView(baseDoc());
    canvasBus.editorHtmlState.emit(metadataHtml([['tags', 'a']]));
    el._libraryFields = [{ key: 'tags', label: 'Tags', type: 'multi', values: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }] }];
    await el.updateComplete;

    const multi = rowFor(el, 'tags').querySelector('ew-metadata-multiselect');
    multi.dispatchEvent(new CustomEvent('change', { detail: { value: 'a, b' } }));

    expect(tableRows(bridge.view)).to.deep.equal([{ key: 'tags', value: 'a, b' }]);
  });

  it('commits a swatch-radio click', async () => {
    bridge.view = makeRealView(baseDoc());
    canvasBus.editorHtmlState.emit(metadataHtml([['accent', 'adobe-red']]));
    el._libraryFields = [{
      key: 'accent',
      label: 'Accent',
      type: 'single',
      values: [{ title: 'Adobe Red', value: 'adobe-red', colorValue: '#FF0000' }, { title: 'Sky', value: 'sky' }],
    }];
    await el.updateComplete;

    rowFor(el, 'accent').querySelector('input[type="radio"][value="sky"]').click();

    expect(tableRows(bridge.view)).to.deep.equal([{ key: 'accent', value: 'sky' }]);
  });

  it('adds a new field via the + dialog', async () => {
    bridge.view = makeRealView(baseDoc());
    canvasBus.editorHtmlState.emit(metadataHtml([]));
    await el.updateComplete;

    el.shadowRoot.querySelector('.add-btn').click();
    await el.updateComplete;
    const dialog = el.shadowRoot.querySelector('.ew-pm-add');
    expect(dialog).to.exist;
    dialog.querySelector('input[name="key"]').value = 'Keywords';
    dialog.querySelector('input[name="key"]').dispatchEvent(new Event('input'));
    dialog.querySelector('input[name="value"]').value = 'foo, bar';
    dialog.querySelector('input[name="value"]').dispatchEvent(new Event('input'));
    dialog.querySelector('.da-btn-primary').click();
    await el.updateComplete;

    expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Keywords', value: 'foo, bar' }]);
    expect(el.shadowRoot.querySelector('.ew-pm-add')).to.equal(null);
  });

  it('deletes a field after confirming the delete dialog', async () => {
    bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
    canvasBus.editorHtmlState.emit(metadataHtml([['Title', 'My Page']]));
    await el.updateComplete;

    rowFor(el, 'Title').querySelector('.delete-btn').click();
    await el.updateComplete;
    el.shadowRoot.querySelector('.ew-pm-delete .da-btn-primary').click();

    expect(tableRows(bridge.view)).to.deep.equal([]);
  });

  it('cancelling the delete dialog leaves the field untouched', async () => {
    bridge.view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
    canvasBus.editorHtmlState.emit(metadataHtml([['Title', 'My Page']]));
    await el.updateComplete;

    rowFor(el, 'Title').querySelector('.delete-btn').click();
    await el.updateComplete;
    el.shadowRoot.querySelector('.ew-pm-delete .da-btn-secondary').click();
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.ew-pm-delete')).to.equal(null);
    expect(tableRows(bridge.view)).to.deep.equal([{ key: 'Title', value: 'My Page' }]);
  });
});
