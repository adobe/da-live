import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DOMParser as PMDOMParser, NodeSelection, TextSelection } from 'da-y-wrapper';
import { getNx, setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { makeView } from '../test-helpers.js';
import { setDaConfigs } from '../../../../fixtures/nx/utils/daConfig.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getExtensionsBridge;
let resetBlockLibraryCache;
let resetBlockOptionsCache;
let hashChange;
let htmlToProse;
let PANEL_EVENT;
before(async () => {
  await import('../../../../../blocks/canvas/ew-block-properties/ew-block-properties.js');
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
  ({ resetBlockLibraryCache, resetBlockOptionsCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js'));
  ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  ({ htmlToProse } = await import('../../../../../blocks/edit/utils/helpers.js'));
  ({ PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`));
});

const fieldsTable = `
  <table><tr><td><p>fields</p></td></tr>
    <tr><td><p>image</p></td></tr>
    <tr><td><p>title</p><p>subheading</p></td></tr>
  </table>`;
const libraryHtml = (fields = fieldsTable, variant = 'left') => `
  <body><div><h2>Hero (Text Start)</h2>
    <div class="hero ${variant}">
      <div><div><picture><img src="/template.png"></picture></div></div>
      <div><div><h1>Template title</h1><p>Template subheading</p></div></div>
    </div>
    <div class="library-metadata"><div><div>fields</div><div>${fields}</div></div></div>
  </div></body>`;

describe('ew-block-properties library fields', () => {
  let el;
  let view;
  let fetchStub;
  let html;
  let assets;
  let assetTestId = 0;

  const fieldElement = (label) => el.shadowRoot.querySelector(`[data-field="${label}"]`);
  const png = () => new File(['image'], 'replacement.png', { type: 'image/png' });
  const withoutFields = (variant = 'left') => libraryHtml(fieldsTable, variant).replace(
    `<div class="library-metadata"><div><div>fields</div><div>${fieldsTable}</div></div></div>`,
    '',
  );
  const generateButton = () => el.shadowRoot.querySelector('.ew-block-generate-fields');

  beforeEach(async () => {
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    html = libraryHtml();
    assets = false;
    fetchStub = sinon.stub(window, 'fetch').callsFake(async (url, options) => {
      if (options?.method === 'POST') {
        return new Response(JSON.stringify({ source: { contentUrl: './media_replacement.png' } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).includes('/mock-hero.html')) {
        return new Response(await html, { headers: { 'Content-Type': 'text/html' } });
      }
      const data = String(url).includes('/mock-blocks.json')
        ? [{ name: 'Hero', path: 'http://localhost:2000/mock-hero.html' }] : [];
      if (String(url).includes('/config/') && assets) {
        data.push({ key: 'aem.repositoryId', value: 'delivery-p1-e1.adobeaemcloud.com' });
      }
      return new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
    });
    setDaConfigs([{ library: { data: [{ title: 'Blocks', path: 'http://localhost:2000/mock-blocks.json' }] } }]);
    hashChange._set({ org: 'fieldorg', site: 'fieldsite' });
    const empty = makeView({ type: 'doc', content: [{ type: 'paragraph' }] });
    const container = document.createElement('div');
    container.innerHTML = `
      <table><tr><td>Hero (left)</td></tr>
        <tr><td><p><img src="/current.png" alt="Existing alt"></p></td></tr>
        <tr><td><h2>Current title</h2><p>Current subheading</p></td></tr>
      </table><p>Outside block</p>`;
    view = makeView(PMDOMParser.fromSchema(empty.state.schema).parse(container).toJSON());
    view.focus = sinon.spy();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
    Object.assign(getExtensionsBridge(), { view, sourceUrl: 'https://admin.da.live/source/fieldorg/fieldsite/dir/page.html' });
    canvasBus.editorHtmlState.emit('<div>Document</div>');
    el = document.createElement('ew-block-properties');
    document.body.append(el);
    await el._loadFields();
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    Object.assign(getExtensionsBridge(), { view: null, sourceUrl: null });
    setDaConfigs([]);
    hashChange._set({});
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    sinon.restore();
    delete window.PureJSSelectors;
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
  });

  it('renders inferred fields with current values, not library values', () => {
    expect([...el.shadowRoot.querySelectorAll('.ew-block-field > label')]
      .map((label) => label.textContent)).to.deep.equal(['image', 'title', 'subheading']);
    expect(fieldElement('image').querySelector('img').getAttribute('src')).to.equal('/current.png');
    expect(fieldElement('title').querySelector('input').value).to.equal('Current title');
    expect(fieldElement('subheading').querySelector('input').value).to.equal('Current subheading');
    const input = fieldElement('title').querySelector('input');
    expect(input.labels[0].textContent).to.equal('title');
    expect(fieldElement('image').querySelector('nx-menu')).to.equal(null);
    expect(generateButton()).to.equal(null);
  });

  it('shows Generate fields instead of field inputs when the variant has no metadata fields', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    await el.updateComplete;
    expect(generateButton().textContent.trim()).to.equal('Generate fields');
    expect(el.shadowRoot.querySelector('.ew-block-field')).to.equal(null);
  });

  it('opens AI chat with a detailed variant-specific draft without auto-sending or editing the page', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    await el.updateComplete;
    const opened = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    const { doc } = view.state;
    try {
      generateButton().click();
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
    expect(opened.calledOnce).to.equal(true);
    const { detail } = opened.firstCall.args[0];
    expect(detail.section).to.equal('chat');
    expect(detail.options.autoSend).to.equal(false);
    const { text } = detail.options;
    [
      'fieldorg/fieldsite',
      'Block name: hero',
      'Variant: left',
      'Exact block table header: Hero (left)',
      'http://localhost:2000/mock-blocks.json',
      'http://localhost:2000/mock-hero.html',
      'Inspect the block library',
      'LIBRARY TEMPLATE',
      'same order',
      'one plain paragraph per field label',
      'Headings and paragraphs are both text',
      'Additional trailing page content',
      'all other variants',
      'Do not replace the block or edit the current page',
      'rather than inventing a schema',
    ].forEach((fragment) => expect(text).to.include(fragment));
    expect(view.state.doc).to.equal(doc);
  });

  it('updates the Generate fields action when switching between defined and undefined variants', async () => {
    resetBlockLibraryCache();
    html = withoutFields() + libraryHtml(fieldsTable, 'center');
    await el._loadFields();
    await el.updateComplete;
    expect(generateButton()).not.to.equal(null);
    el._onVariantChange({ detail: { value: 'center' } });
    await el._loadFields();
    await el.updateComplete;
    expect(generateButton()).to.equal(null);
    expect(fieldElement('title')).not.to.equal(null);
    el._onVariantChange({ detail: { value: 'left' } });
    await el._loadFields();
    await el.updateComplete;
    expect(generateButton()).not.to.equal(null);
    expect(el._generateFieldsContext.variant).to.equal('left');
  });

  it('offers generation when a structurally valid metadata table has no field labels set', async () => {
    resetBlockLibraryCache();
    html = libraryHtml(fieldsTable.replace(/<p>(image|title|subheading)<\/p>/g, '<p></p>'));
    await el._loadFields();
    await el.updateComplete;
    expect(generateButton()).not.to.equal(null);
    expect(el.shadowRoot.querySelector('.ew-block-field')).to.equal(null);
  });

  it('describes a missing library explicitly rather than inventing a source reference', async () => {
    setDaConfigs([]);
    resetBlockLibraryCache();
    await el._loadFields();
    await el.updateComplete;
    const opened = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    try {
      generateButton().click();
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
    expect(opened.firstCall.args[0].detail.options.text).to.include('No block library is configured');
    expect(opened.firstCall.args[0].detail.options.autoSend).to.equal(false);
  });

  it('describes the no-variant selection without reusing the previous variant', async () => {
    resetBlockLibraryCache();
    html = withoutFields('');
    el._onVariantChange({ detail: { value: '' } });
    await el._loadFields();
    await el.updateComplete;
    const opened = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    try {
      generateButton().click();
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
    expect(opened.firstCall.args[0].detail.options.text).to.include('Variant: (no variant)');
    expect(el._generateFieldsContext.variant).to.equal('');
  });

  it('does not draft a prompt for a block that is no longer selected', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(view.state.doc, view.state.doc.firstChild.nodeSize + 1),
    ));
    const opened = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    try {
      el._onGenerateFields();
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
    expect(opened.called).to.equal(false);
  });

  it('hides Generate fields while metadata is loading rather than using stale library context', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    resetBlockLibraryCache();
    let finish;
    html = new Promise((resolve) => { finish = resolve; });
    const loading = el._loadFields();
    await el.updateComplete;
    expect(generateButton()).to.equal(null);
    finish(withoutFields());
    await loading;
    await el.updateComplete;
    expect(generateButton()).not.to.equal(null);
  });

  it('does not offer generation when existing fields metadata is malformed', async () => {
    resetBlockLibraryCache();
    html = libraryHtml('not a table');
    await el._loadFields();
    await el.updateComplete;
    expect(generateButton()).to.equal(null);
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Fields header');
  });

  it('keeps multi-item controls alongside Generate fields when metadata is absent', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    el._isMulti = true;
    await el.updateComplete;
    expect(generateButton()).not.to.equal(null);
    expect(el.shadowRoot.querySelector('.ew-block-items')).not.to.equal(null);
  });

  it('maps the authored Hero layout using the editor content parser', async () => {
    const authored = libraryHtml()
      .replace('<body>', '<body><header></header><main>')
      .replace('</body>', '</main><footer></footer></body>');
    const { dom } = htmlToProse(authored);
    view = makeView(PMDOMParser.fromSchema(view.state.schema).parse(dom).toJSON());
    let blockPos;
    view.state.doc.descendants((node, pos) => {
      if (blockPos == null && node.type.name === 'table') blockPos = pos;
    });
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blockPos)));
    getExtensionsBridge().view = view;
    canvasBus.editorDocState.emit();
    await el._loadFields();
    await el.updateComplete;
    expect(el._fields.every((field) => !field.error)).to.equal(true);
    expect(fieldElement('title').querySelector('input').value).to.equal('Template title');
    expect(fieldElement('subheading').querySelector('input').value).to.equal('Template subheading');
  });

  it('maps the demo Hero fields while preserving the extra View on GitHub paragraph', async () => {
    const title = el._fields[1];
    const subheading = el._fields[2];
    const { schema } = view.state;
    const link = schema.marks.link.create({ href: 'https://github.com/aemsites/author-kit/' });
    const extra = schema.nodes.paragraph.create(null, schema.text('View on GitHub', [
      schema.marks.em.create(), schema.marks.strong.create(), link,
    ]));
    const tr = view.state.tr.insert(subheading.pos + subheading.node.nodeSize, extra);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const input = fieldElement('title').querySelector('input');
    expect(input.readOnly).to.equal(false);
    expect(input.value).to.equal('Current title');
    expect(fieldElement('subheading').querySelector('input').value).to.equal('Current subheading');
    expect(el.shadowRoot.querySelector('[role="alert"]')).to.equal(null);
    input.value = 'Updated demo title';
    input.dispatchEvent(new Event('blur'));
    const cell = view.state.doc.firstChild.child(2).firstChild;
    expect(cell.child(0).textContent).to.equal('Updated demo title');
    expect(cell.child(1).textContent).to.equal('Current subheading');
    expect(cell.child(2)).to.equal(extra);
    expect(view.state.doc.nodeAt(title.pos).type.name).to.equal('heading');
  });

  it('commits text on blur while preserving heading attributes, neighbors and selection', async () => {
    const field = el._fields.find((item) => item.label === 'title');
    const before = view.state.doc.nodeAt(field.pos);
    const image = el._fields[0].node;
    const input = fieldElement('title').querySelector('input');
    input.value = 'Updated title';
    input.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    const after = view.state.doc.nodeAt(field.pos);
    expect(after.type.name).to.equal('heading');
    expect(after.attrs).to.deep.equal(before.attrs);
    expect(after.attrs.level).to.equal(2);
    expect(after.textContent).to.equal('Updated title');
    expect(view.state.doc.nodeAt(el._fields[0].pos)).to.equal(image);
    expect(fieldElement('subheading').querySelector('input').value).to.equal('Current subheading');
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
  });

  it('maps plain-text field labels to paragraphs and wrapped headings without tag matching', async () => {
    const title = el._fields[1];
    const node = view.state.schema.nodes.blockquote.create(null, title.node);
    const tr = view.state.tr.replaceWith(title.pos, title.pos + title.node.nodeSize, node);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const input = fieldElement('title').querySelector('input');
    expect(input.readOnly).to.equal(false);
    expect(input.value).to.equal('Current title');
    expect(fieldElement('subheading').querySelector('input').value).to.equal('Current subheading');
    input.value = 'Updated wrapped title';
    input.dispatchEvent(new Event('blur'));
    const wrapped = view.state.doc.nodeAt(title.pos);
    expect(wrapped.type.name).to.equal('blockquote');
    expect(wrapped.firstChild.type.name).to.equal('heading');
    expect(wrapped.firstChild.attrs.level).to.equal(2);
    expect(wrapped.textContent).to.equal('Updated wrapped title');
  });

  it('preserves empty text containers and skips unchanged edits', () => {
    const field = el._fields.find((item) => item.label === 'subheading');
    const { doc } = view.state;
    el._commitText(field, field.value);
    expect(view.state.doc).to.equal(doc);
    el._commitText(field, '');
    const node = view.state.doc.nodeAt(field.pos);
    expect(node.type.name).to.equal('paragraph');
    expect(node.textContent).to.equal('');
  });

  it('refreshes fields after external text edits', async () => {
    const field = el._fields.find((item) => item.label === 'title');
    const tr = view.state.tr.insertText(
      'External title',
      field.pos + 1,
      field.pos + 1 + field.node.content.size,
    );
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect(fieldElement('title').querySelector('input').value).to.equal('External title');
  });

  it('does not apply a stale blur after the selected field changes', () => {
    const field = el._fields.find((item) => item.label === 'title');
    view.dispatch(view.state.tr.insertText(
      'External',
      field.pos + 1,
      field.pos + 1 + field.node.content.size,
    ));
    const { doc } = view.state;
    el._commitText(field, 'Stale title');
    expect(view.state.doc).to.equal(doc);
  });

  it('disables text and image changes in a read-only document', async () => {
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect(fieldElement('title').querySelector('input').readOnly).to.equal(true);
    expect(fieldElement('image').querySelector('button').disabled).to.equal(true);
    const { doc } = view.state;
    el._commitText(el._fields[1], 'Do not save');
    expect(el._captureField(el._fields[0])).to.equal(null);
    expect(view.state.doc).to.equal(doc);
  });

  it('replaces only the mapped image through the source uploader, preserving attributes', async () => {
    const field = el._fields[0];
    const target = el._captureField(field);
    await el._uploadFieldImage(field, target, png());
    const image = view.state.doc.nodeAt(field.pos);
    expect(image.attrs.src).to.equal('./media_replacement.png');
    expect(image.attrs.alt).to.equal('Existing alt');
    expect(el._fields[1].value).to.equal('Current title');
    const request = fetchStub.getCalls().find((call) => call.args[1]?.method === 'POST');
    expect(request.args[0]).to.include('/dir/.page/replacement.png');
    expect(el._uploadingField).to.equal(null);
    expect(el._fieldError).to.equal('');
  });

  it('opens a file input with the toolbar image formats', () => {
    const create = document.createElement.bind(document);
    let input;
    sinon.stub(document, 'createElement').callsFake((tag, ...args) => {
      const node = create(tag, ...args);
      if (tag === 'input') {
        input = node;
        sinon.stub(node, 'click');
      }
      return node;
    });
    fieldElement('image').querySelector('button').click();
    expect(input.type).to.equal('file');
    expect(input.accept).to.equal('image/svg+xml,image/png,image/jpeg,image/gif');
    expect(input.click.calledOnce).to.equal(true);
  });

  it('shows Upload and AEM Assets choices only when configured', async () => {
    assets = true;
    hashChange._set({ org: 'assetfieldorg', site: 'assetfieldsite' });
    await el._loadFields();
    await el.updateComplete;
    const menu = fieldElement('image').querySelector('nx-menu');
    expect(menu.items).to.deep.equal([
      { id: 'upload', label: 'Upload' }, { id: 'aem-assets', label: 'AEM Assets' },
    ]);
    const upload = sinon.stub(el, '_triggerFieldUpload');
    const openAssetPicker = sinon.stub(el, '_openFieldAssets');
    menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'upload' } }));
    menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'aem-assets' } }));
    expect(upload.calledOnce).to.equal(true);
    expect(openAssetPicker.calledOnce).to.equal(true);
  });

  async function openAssets() {
    assets = true;
    assetTestId += 1;
    hashChange._set({ org: `fieldassets${assetTestId}`, site: 'assetfieldsite' });
    await el._loadFields();
    let selector;
    window.PureJSSelectors = { renderAssetSelector: (container, props) => { selector = props; } };
    const append = document.head.append.bind(document.head);
    sinon.stub(document.head, 'append').callsFake((...nodes) => {
      if (nodes[0].tagName === 'SCRIPT') nodes[0].dispatchEvent(new Event('load'));
      else append(...nodes);
    });
    setNx('/test/fixtures/nx2', { hostname: 'example.com' });
    await el._openFieldAssets(el._fields[0]);
    expect(selector).not.to.equal(undefined);
    return selector;
  }

  const asset = {
    'aem:formatName': 'png',
    mimetype: 'image/png',
    'repo:assetId': 'selected-asset',
    'repo:name': 'replacement.png',
    'dc:title': 'Asset alt',
    path: '/content/dam/replacement.png',
  };

  it('uses AEM Assets to replace the mapped image rather than the current cursor content', async () => {
    const selector = await openAssets();
    const field = el._fields[0];
    const title = el._fields[1];
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, title.pos + 1)));
    await selector.handleSelection([asset]);
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const image = view.state.doc.nodeAt(field.pos);
    expect(image.attrs.src).to.equal(
      'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/selected-asset/as/replacement.avif',
    );
    expect(image.attrs.alt).to.equal('Asset alt');
    expect(el._fields[1].value).to.equal('Current title');
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
  });

  it('ignores an AEM Assets selection after the replacement dialog is cancelled', async () => {
    const selector = await openAssets();
    el.shadowRoot.querySelector('nx-dialog').dispatchEvent(new Event('close'));
    const { doc } = view.state;
    await selector.handleSelection([asset]);
    expect(view.state.doc).to.equal(doc);
  });

  it('ignores an AEM Assets selection after a concurrent block change', async () => {
    const selector = await openAssets();
    const title = el._fields[1];
    view.dispatch(view.state.tr.insertText('New title', title.pos + 1));
    const { doc } = view.state;
    await selector.handleSelection([asset]);
    expect(view.state.doc).to.equal(doc);
  });

  it('reloads field definitions when switching to another library variant', async () => {
    resetBlockLibraryCache();
    html = libraryHtml() + libraryHtml(fieldsTable.replace('<p>title</p>', '<p>center title</p>'), 'center');
    await el._loadVariants();
    const picker = el.shadowRoot.querySelector('nx-picker');
    await el.updateComplete;
    expect(picker.items.map((item) => item.value)).to.deep.equal(['', 'left', 'center']);
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'center' } }));
    await el._loadFields();
    await el.updateComplete;
    expect(fieldElement('center title').querySelector('input').value).to.equal('Current title');
    expect(fieldElement('title')).to.equal(null);
  });

  it('keeps the original image and displays upload failures', async () => {
    const field = el._fields[0];
    const target = el._captureField(field);
    fetchStub.callsFake(async () => new Response('Failed', { status: 500 }));
    await el._uploadFieldImage(field, target, png());
    await el.updateComplete;
    expect(view.state.doc.nodeAt(field.pos)).to.equal(field.node);
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('500');
    expect(el._uploadingField).to.equal(null);
  });

  it('reports missing upload context and unsupported image types', async () => {
    getExtensionsBridge().sourceUrl = null;
    const field = el._fields[0];
    await el._uploadFieldImage(field, el._captureField(field), png());
    expect(el._fieldError).to.include('source is unavailable');
    getExtensionsBridge().sourceUrl = 'https://admin.da.live/source/fieldorg/fieldsite/page.html';
    await el._uploadFieldImage(
      field,
      el._captureField(field),
      new File(['text'], 'file.txt', { type: 'text/plain' }),
    );
    expect(el._fieldError).to.include('SVG, PNG, JPEG, or GIF');
    expect(view.state.doc.nodeAt(field.pos)).to.equal(field.node);
  });

  [false, true].forEach((navigate) => {
    it(`does not replace an image after ${navigate ? 'navigation' : 'a concurrent block edit'}`, async () => {
      const field = el._fields[0];
      const target = el._captureField(field);
      let finish;
      let start;
      const started = new Promise((resolve) => { start = resolve; });
      fetchStub.callsFake(async () => new Promise((resolve) => {
        finish = resolve;
        start();
      }));
      const uploading = el._uploadFieldImage(field, target, png());
      await started;
      if (navigate) getExtensionsBridge().view = null;
      else view.dispatch(view.state.tr.insertText('Changed', el._fields[1].pos + 1));
      finish(new Response(JSON.stringify({ source: { contentUrl: './media_stale.png' } })));
      await uploading;
      expect(view.state.doc.nodeAt(field.pos)).to.equal(field.node);
    });
  });

  it('discards pending field metadata after deselection', async () => {
    resetBlockLibraryCache();
    let resolve;
    html = new Promise((done) => { resolve = done; });
    const loading = el._loadFields();
    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(view.state.doc, view.state.doc.firstChild.nodeSize + 1),
    ));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc' });
    resolve(libraryHtml());
    await loading;
    await el.updateComplete;
    expect(el._fieldDefinitions).to.deep.equal([]);
    expect(el.shadowRoot.querySelector('.ew-block-field')).to.equal(null);
  });

  it('leaves the existing multi-item UI unchanged', async () => {
    el._isMulti = true;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-block-field')).to.equal(null);
    expect(el.shadowRoot.querySelector('.ew-block-items')).not.to.equal(null);
  });

  it('shows metadata and structure errors instead of editing an incorrect element', async () => {
    const field = el._fields[1];
    view.dispatch(view.state.tr.delete(field.pos, field.pos + field.node.nodeSize));
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect(fieldElement('title').querySelector('input').readOnly).to.equal(true);
    expect(fieldElement('title').querySelector('[role="alert"]').textContent).to.include('structure');
    resetBlockLibraryCache();
    html = libraryHtml('not a table');
    await el._loadFields();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Fields header');
  });
});
