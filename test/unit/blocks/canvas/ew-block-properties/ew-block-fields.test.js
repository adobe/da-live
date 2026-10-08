import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DOMParser as PMDOMParser, NodeSelection, TextSelection } from 'da-y-wrapper';
import { getNx, setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { makeView } from '../test-helpers.js';
import { setDaConfigs } from '../../../../fixtures/nx/utils/daConfig.js';
import { buildBlockFieldDefinitions, resolveBlockFields } from '../../../../../blocks/canvas/editor-utils/block-fields.js';

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

const multiFieldsTable = `<table><tr><td colspan="2">fields</td></tr>
  <tr><td>Image</td><td><p>Title</p><p>Link</p><p>List</p></td></tr></table>`;
const multiContent = (name) => `<h3>${name} title</h3>
  <p><strong><a href="/${name.toLowerCase()}">${name} link</a></strong></p>
  <ul><li>${name} one</li><li>${name} two</li></ul>`;
const multiLibraryHtml = (fields = multiFieldsTable, variant = 'left', name = 'Template') => `
  <body><div><h2>Hero</h2><div class="hero ${variant}">
    <div><div><picture><img src="/template.png"></picture></div><div>${multiContent(name)}</div></div>
    <div><div><picture><img src="/other-template.png"></picture></div><div>${multiContent('Other')}</div></div>
  </div>${fields === null ? '' : `<div class="library-metadata"><div><div>fields</div><div>${fields}</div></div></div>`}
  </div></body>`;
const cardsFieldsTable = `<table><tr><td colspan="2">fields</td></tr>
  <tr><td>Image</td><td><p>Title</p><p>Price</p><p>Link</p></td></tr></table>`;
const cardsBlockHtml = `<div class="cards default">
  ${[['First', '$39.99'], ['Second', '$249.99'], ['Third', '$14.99']].map(([name, price]) => `
    <div><div><picture><img src="/${name.toLowerCase()}.png"></picture></div>
      <div><h3>${name} title</h3><p>${price}</p><p><a href="/${name.toLowerCase()}">Shop now</a></p></div></div>
  `).join('')}</div>`;
const cardsLibraryHtml = (fields = cardsFieldsTable) => `<body><div><h2>Cards - Default</h2>
  ${cardsBlockHtml}
  ${fields === null ? '' : `<div class="library-metadata"><div><div>fields</div><div>${fields}</div></div></div>`}
  </div></body>`;

describe('ew-block-properties library fields', () => {
  let el;
  let view;
  let fetchStub;
  let html;
  let assets;
  let blockOptions;
  let blockEditor;
  let assetTestId = 0;

  const fieldElement = (label) => el.shadowRoot.querySelector(`[data-field="${label}"]`);
  const png = () => new File(['image'], 'replacement.png', { type: 'image/png' });
  const withoutFields = (variant = 'left') => libraryHtml(fieldsTable, variant).replace(
    `<div class="library-metadata"><div><div>fields</div><div>${fieldsTable}</div></div></div>`,
    '',
  );
  const generateButton = () => el.shadowRoot.querySelector('.ew-block-generate-fields');
  const refreshButton = () => el.shadowRoot.querySelector('.ew-block-refresh-library');

  beforeEach(async () => {
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    html = libraryHtml();
    assets = false;
    blockOptions = [];
    blockEditor = [];
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
      const sheets = String(url).includes('/mock-blocks.json')
        ? { options: { data: blockOptions }, editor: { data: blockEditor } } : {};
      return new Response(JSON.stringify({ data, ...sheets }), { headers: { 'Content-Type': 'application/json' } });
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
    expect(refreshButton()).to.equal(null);
    expect(el.shadowRoot.querySelector('.ew-block-field')).to.equal(null);
  });

  it('shows Refresh after requesting generation and reloads the library to render new fields', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    await el.updateComplete;
    generateButton().click();
    await el.updateComplete;
    expect(refreshButton().textContent.trim()).to.equal('Refresh');
    fetchStub.resetHistory();
    html = libraryHtml() + libraryHtml(fieldsTable, 'center');
    const { doc } = view.state;
    const refresh = sinon.spy(el, '_onRefreshLibrary');
    el.requestUpdate();
    await el.updateComplete;
    refreshButton().click();
    expect(refresh.calledOnce).to.equal(true);
    await refresh.returnValues[0];
    await el.updateComplete;
    const fetchedUrls = fetchStub.getCalls().map((call) => String(call.args[0]));
    expect(fetchedUrls).to.include('http://localhost:2000/mock-blocks.json');
    expect(fetchedUrls).to.include('http://localhost:2000/mock-hero.html');
    expect(fieldElement('title').querySelector('input').value).to.equal('Current title');
    expect(el._variantOptions).to.include('center');
    expect(generateButton()).to.equal(null);
    expect(refreshButton()).to.equal(null);
    expect(view.state.doc).to.equal(doc);
  });

  it('disables Refresh while loading and allows retry when fields are still missing', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    el._onGenerateFields();
    let finish;
    html = new Promise((resolve) => { finish = resolve; });
    const loading = el._onRefreshLibrary();
    await el.updateComplete;
    expect(refreshButton().disabled).to.equal(true);
    expect(refreshButton().textContent.trim()).to.equal('Refreshing...');
    const calls = fetchStub.callCount;
    await el._onRefreshLibrary();
    expect(fetchStub.callCount).to.equal(calls);
    finish(withoutFields());
    await loading;
    await el.updateComplete;
    expect(refreshButton().disabled).to.equal(false);
    expect(refreshButton().textContent.trim()).to.equal('Refresh');
    expect(generateButton()).not.to.equal(null);
  });

  it('does not retain the generation refresh action when switching variants or unloading the document', async () => {
    resetBlockLibraryCache();
    html = withoutFields() + withoutFields('center');
    await el._loadFields();
    el._onGenerateFields();
    await el.updateComplete;
    expect(refreshButton()).not.to.equal(null);
    el._onVariantChange({ detail: { value: 'center' } });
    await el._loadFields();
    await el.updateComplete;
    expect(refreshButton()).to.equal(null);
    el._onGenerateFields();
    await el.updateComplete;
    expect(refreshButton()).not.to.equal(null);
    canvasBus.editorHtmlState.emit('');
    await el.updateComplete;
    expect(refreshButton()).to.equal(null);
  });

  it('keeps Refresh available after a metadata error so the corrected library can be reloaded', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    el._onGenerateFields();
    html = libraryHtml('not a table');
    await el._onRefreshLibrary();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Fields header');
    expect(refreshButton().disabled).to.equal(false);
    html = libraryHtml();
    await el._onRefreshLibrary();
    await el.updateComplete;
    expect(fieldElement('title')).not.to.equal(null);
    expect(el.shadowRoot.querySelector('[role="alert"]')).to.equal(null);
    expect(refreshButton()).to.equal(null);
  });

  it('does not apply refreshed fields to a different selection', async () => {
    resetBlockLibraryCache();
    html = withoutFields();
    await el._loadFields();
    el._onGenerateFields();
    let finish;
    html = new Promise((resolve) => { finish = resolve; });
    const loading = el._onRefreshLibrary();
    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(view.state.doc, view.state.doc.firstChild.nodeSize + 1),
    ));
    el._refresh();
    finish(libraryHtml());
    await loading;
    await el.updateComplete;
    expect(el._fieldDefinitions).to.deep.equal([]);
    expect(refreshButton()).to.equal(null);
    expect(el._refreshingLibrary).to.equal(false);
  });

  it('auto-sends a variant-specific generation prompt with a valid Everything Block example without editing the page', async () => {
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
    expect(detail.options.autoSend).to.equal(true);
    const { text } = detail.options;
    [
      'fieldorg/fieldsite',
      'Block name: hero',
      'Variant: left',
      'Multi-item block: no',
      'Exact block table header: Hero (left)',
      'http://localhost:2000/mock-blocks.json',
      'http://localhost:2000/mock-hero.html',
      'Inspect the block library',
      'LIBRARY TEMPLATE',
      'same order',
      'one plain paragraph per field label',
      'Headings and paragraphs are both text',
      'one label for the whole list',
      'exact label IGNORE',
      'not type declarations or dropdown choices',
      'all other variants',
      'Do not replace the block or edit the current page',
      'rather than inventing a schema',
    ].forEach((fragment) => expect(text).to.include(fragment));
    expect(text.length).to.be.below(6000);
    for (const fragment of [
      '200 characters', 'read-only', 'textarea', 'grayed out', 'blue insertion lines',
      'Alt+Arrow', 'options sheet', 'whole-text bold link', 'URL controls', 'Selected page items:',
    ]) expect(text).not.to.include(fragment);
    const example = text.slice(
      text.indexOf('<div class="everything-block">'),
      text.indexOf('\nAdapt the rows'),
    );
    const container = document.createElement('div');
    container.innerHTML = example;
    const fields = container.querySelector('.library-metadata table');
    const { dom } = htmlToProse(`<body><main><div>${example}</div></main></body>`);
    const blockContainer = document.createElement('div');
    blockContainer.append(dom.querySelector('table').cloneNode(true));
    const template = PMDOMParser.fromSchema(view.state.schema).parse(blockContainer).firstChild;
    const definitions = buildBlockFieldDefinitions({ item: { fields }, template });
    const resolved = resolveBlockFields({ node: template, from: 0 }, definitions);
    expect(resolved.map((field) => field.label)).to.deep.equal([
      'title', 'tagline', 'image', 'list below image', 'quote', 'paragraph',
      'link', 'Color', 'Left Column', 'Right Column',
    ]);
    expect(resolved.every((field) => !field.error)).to.equal(true);
    expect(resolved[3].items.map((item) => item.value)).to.deep.equal(['List', 'Item 2', 'Item 3']);
    expect(resolved[5].readOnly).to.equal(false);
    expect(resolved[6].href).to.equal('https://google.com');
    expect(resolved[7].optionKey).to.equal('Color');
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
    expect(opened.firstCall.args[0].detail.options.autoSend).to.equal(true);
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

  it('offers targeted repair while reporting malformed existing fields metadata', async () => {
    resetBlockLibraryCache();
    html = libraryHtml('not a table');
    await el._loadFields();
    await el.updateComplete;
    expect(generateButton().textContent.trim()).to.equal('Repair fields');
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

  const setTextTemplate = async (content, labels = '<p>title</p><p>subheading</p>') => {
    const fields = fieldsTable.replace('<p>title</p><p>subheading</p>', labels);
    html = libraryHtml(fields).replace('<h1>Template title</h1><p>Template subheading</p>', content);
    const container = document.createElement('div');
    container.innerHTML = `<table><tr><td>Hero (left)</td></tr>
      <tr><td><p><img src="/current.png"></p></td></tr>
      <tr><td>${content}</td></tr></table><p>Outside block</p>`;
    const doc = PMDOMParser.fromSchema(view.state.schema).parse(container);
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    resetBlockLibraryCache();
    await el._loadFields();
    el._refresh();
    await el.updateComplete;
  };

  const setMultiTemplate = async (fields = multiFieldsTable) => {
    blockEditor = [{ block: 'hero', property: 'multi' }];
    html = multiLibraryHtml(fields);
    const container = document.createElement('div');
    container.innerHTML = `<table><tr><td colspan="2">Hero (left)</td></tr>
      <tr><td><p><img src="/first.png"></p></td><td>${multiContent('First')}</td></tr>
      <tr><td><p><img src="/second.png"></p></td><td>${multiContent('Second')}</td></tr>
      </table><p>Outside block</p>`;
    const doc = PMDOMParser.fromSchema(view.state.schema).parse(container);
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    el._refresh();
    await Promise.all([el._loadMultiBlock(), el._loadFields()]);
    await el.updateComplete;
  };
  const itemCard = (index) => el.shadowRoot.querySelectorAll('.ew-block-multi-item')[index];
  const itemField = (index, label) => itemCard(index).querySelector(`[data-field="${label}"]`);
  const expandItem = async (index) => {
    itemCard(index).querySelector('.ew-block-item-toggle').click();
    await el.updateComplete;
  };
  const setCardsTemplate = async (fields = cardsFieldsTable) => {
    blockEditor = [{ block: 'cards', property: 'multi' }];
    html = cardsLibraryHtml(fields);
    const { dom } = htmlToProse(`<body><main><div>${cardsBlockHtml}</div></main></body>`);
    const container = document.createElement('div');
    container.append(dom.querySelector('table'));
    const doc = PMDOMParser.fromSchema(view.state.schema).parse(container);
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    el._refresh();
    await Promise.all([el._loadMultiBlock(), el._loadFields()]);
    await el.updateComplete;
  };

  it('treats three library Cards rows as samples and sends their repeatability explicitly', async () => {
    await setCardsTemplate(null);
    expect(el._isMulti).to.equal(true);
    expect(el.shadowRoot.querySelectorAll('.ew-block-multi-item').length).to.equal(3);
    expect(view.state.doc.firstChild.textContent).not.to.include('List');
    const opened = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    try {
      generateButton().click();
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
    const { options } = opened.firstCall.args[0].detail;
    expect(options.autoSend).to.equal(true);
    for (const fragment of [
      'Block name: cards', 'Variant: default', 'Multi-item block: yes',
      'Library template sample items: 3', 'block=cards, property=multi',
      'generate fields for ONLY the FIRST content row',
      'THREE sample items and ONE shared first-item schema',
    ]) expect(options.text).to.include(fragment);
    expect(options.text.length).to.be.below(6000);
    expect(options.text).not.to.include('Selected page items:');
    expect(options.text).not.to.include('<div class="everything-block">');
  });

  it('generates fields for all three Cards rows when Cards is not configured as multi', async () => {
    await setCardsTemplate(null);
    blockEditor = [{ block: 'hero', property: 'multi' }];
    resetBlockOptionsCache();
    await Promise.all([el._loadMultiBlock(), el._loadFields()]);
    await el.updateComplete;
    expect(el._isMulti).to.equal(false);
    expect(el.shadowRoot.querySelector('.ew-block-items')).to.equal(null);
    const opened = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    try {
      generateButton().click();
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
    const { options } = opened.firstCall.args[0].detail;
    for (const fragment of [
      'Multi-item block: no', 'Library template content rows: 3',
      'generate fields for ALL N content rows',
      'Never infer this from row count',
      'Its field schema must describe all of the library template content rows',
    ]) expect(options.text).to.include(fragment);
    expect(options.text).not.to.include('Library template sample items:');
    expect(options.text).not.to.include('Repeating-block contract');
    expect(options.text).not.to.include('<div class="cards">');
    const container = document.createElement('div');
    container.innerHTML = cardsFieldsTable;
    const fields = container.firstChild;
    fields.tBodies[0].append(fields.rows[1].cloneNode(true), fields.rows[1].cloneNode(true));
    const { doc } = view.state;
    html = cardsLibraryHtml(fields.outerHTML);
    await el._onRefreshLibrary();
    await el.updateComplete;
    expect(el._fieldError).to.equal('');
    expect(el._fieldDefinitions.length).to.equal(12);
    expect(el._fields.filter((field) => field.label === 'Title').map((field) => field.value))
      .to.deep.equal(['First title', 'Second title', 'Third title']);
    expect(generateButton()).to.equal(null);
    expect(view.state.doc).to.equal(doc);
  });

  it('reuses a first-item schema across three sample Cards and newly added cards', async () => {
    await setCardsTemplate();
    expect(el._fieldError).to.equal('');
    expect(el._fieldDefinitions.length).to.equal(4);
    expect(el._fields.length).to.equal(12);
    expect(generateButton()).to.equal(null);
    await expandItem(2);
    expect(itemField(2, 'Title').querySelector('input').value).to.equal('Third title');
    expect(itemField(2, 'Price').querySelector('input').value).to.equal('$14.99');
    expect(itemField(2, 'Link').querySelector('input[type="url"]').value).to.equal('/third');
    const table = view.state.doc.firstChild;
    const title = itemField(2, 'Title').querySelector('input');
    title.value = 'Updated third card';
    title.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(view.state.doc.firstChild.child(1)).to.equal(table.child(1));
    expect(view.state.doc.firstChild.child(2)).to.equal(table.child(2));
    el._onAddItem();
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.ew-block-multi-item').length).to.equal(4);
    expect(el._fields.length).to.equal(16);
    await expandItem(3);
    expect(itemField(3, 'Title').querySelector('input').value).to.equal('First title');
    expect(itemField(2, 'Title').querySelector('input').value).to.equal('Updated third card');
  });

  it('places the grab handle before the expansion chevron', async () => {
    await setMultiTemplate();
    const header = itemCard(0).querySelector('.ew-block-item-header');
    expect(header.firstElementChild).to.equal(header.querySelector('.ew-block-item-grip'));
    expect(header.children[1]).to.equal(header.querySelector('.ew-block-item-toggle'));
  });

  it('expands every repeated item into its own editor using the first-item field schema', async () => {
    await setMultiTemplate();
    expect(el._fieldError).to.equal('');
    expect(el._fieldDefinitions.length).to.equal(4);
    expect(el._fields.length).to.equal(8);
    expect(generateButton()).to.equal(null);
    expect(el.shadowRoot.querySelector('.ew-block-field')).to.equal(null);
    expect(itemCard(1).querySelector('.ew-block-item-toggle').getAttribute('aria-expanded')).to.equal('false');
    await expandItem(1);
    expect(itemCard(1).querySelector('.ew-block-item-toggle').getAttribute('aria-expanded')).to.equal('true');
    expect(itemField(1, 'Title').querySelector('input').value).to.equal('Second title');
    expect(itemField(1, 'Image').querySelector('img').getAttribute('src')).to.equal('/second.png');
    expect(itemField(1, 'Link').querySelector('input[type="url"]').value).to.equal('/second');
    expect(itemField(1, 'List').querySelectorAll('.ew-block-list-item').length).to.equal(2);
    expect(itemCard(0).querySelector('.ew-block-item-fields')).to.equal(null);
    await expandItem(0);
    expect(itemField(0, 'Title').querySelector('input').value).to.equal('First title');
    const ids = [...el.shadowRoot.querySelectorAll('.ew-block-item-fields [id]')].map((node) => node.id);
    expect(new Set(ids).size).to.equal(ids.length);
    await expandItem(1);
    expect(itemCard(1).querySelector('.ew-block-item-fields')).to.equal(null);
    expect(itemField(0, 'Title')).not.to.equal(null);
  });

  it('edits text, links, lists and images in only the expanded repeated item', async () => {
    await setMultiTemplate();
    await expandItem(1);
    const table = view.state.doc.firstChild;
    const input = itemField(1, 'Title').querySelector('input');
    input.value = 'Updated second title';
    input.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(el._expandedItems.has(1)).to.equal(true);
    expect(itemField(1, 'Title').querySelector('input').value).to.equal('Updated second title');
    const title = el._fields.find((field) => field.itemIndex === 1 && field.label === 'Title');
    expect(title.node.attrs.level).to.equal(3);
    const link = el._fields.find((field) => field.itemIndex === 1 && field.label === 'Link');
    const marks = link.node.firstChild.marks.map((mark) => mark.type.name);
    const url = itemField(1, 'Link').querySelector('input[type="url"]');
    url.value = '/changed';
    url.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(el._fields.find((field) => field.itemIndex === 1 && field.label === 'Link')
      .node.firstChild.marks.map((mark) => mark.type.name)).to.deep.equal(marks);
    itemField(1, 'List').querySelector('button').click();
    await el.updateComplete;
    expect(el._fields.find((field) => field.itemIndex === 1 && field.label === 'List').items.length)
      .to.equal(3);
    const image = el._fields.find((field) => field.itemIndex === 1 && field.label === 'Image');
    await el._uploadFieldImage(image, el._captureField(image), png());
    await el.updateComplete;
    expect(itemField(1, 'Image').querySelector('img').getAttribute('src')).to.equal('./media_replacement.png');
    expect(view.state.doc.firstChild.firstChild).to.equal(table.firstChild);
    expect(view.state.doc.firstChild.child(1)).to.equal(table.child(1));
    expect(view.state.doc.lastChild.textContent).to.equal('Outside block');
    expect(el._expandedItems.has(1)).to.equal(true);
  });

  it('keeps the correct item expanded through reordering, deletion and adding template items', async () => {
    await setMultiTemplate();
    await expandItem(1);
    const stale = el._fields.find((field) => field.itemIndex === 1 && field.label === 'Title');
    itemCard(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    await el.updateComplete;
    expect(el._expandedItems.has(0)).to.equal(true);
    expect(itemField(0, 'Title').querySelector('input').value).to.equal('Second title');
    const { doc } = view.state;
    el._commitText(stale, 'Do not save');
    expect(view.state.doc).to.equal(doc);
    el._onDeleteItem(0);
    await el.updateComplete;
    expect(el._expandedItems.size).to.equal(0);
    el._onAddItem();
    await el.updateComplete;
    await expandItem(1);
    expect(itemField(1, 'Title').querySelector('input').value).to.equal('Template title');
    expect(el._fields.every((field) => !field.error)).to.equal(true);
  });

  it('uses the selected variant first item when adding multi-block rows', async () => {
    await setMultiTemplate();
    html += multiLibraryHtml(multiFieldsTable, 'right', 'Right template');
    resetBlockLibraryCache();
    el._onVariantChange({ detail: { value: 'right' } });
    await Promise.all([el._loadFields(), el._loadMultiBlock()]);
    el._onAddItem();
    await el.updateComplete;
    await expandItem(2);
    expect(itemField(2, 'Title').querySelector('input').value).to.equal('Right template title');
    expect(el._fields.every((field) => !field.error)).to.equal(true);
  });

  it('keeps read-only repeated item editors inspectable without permitting edits', async () => {
    await setMultiTemplate();
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    await expandItem(1);
    expect(itemField(1, 'Title').querySelector('input').readOnly).to.equal(true);
    expect(itemField(1, 'Image').querySelector('button').disabled).to.equal(true);
    const { doc } = view.state;
    el._commitText(el._fields.find((field) => field.itemIndex === 1 && field.label === 'Title'), 'No edit');
    expect(view.state.doc).to.equal(doc);
  });

  it('keeps nested list drag and field clicks separate from the repeating item controls', async () => {
    await setMultiTemplate();
    await expandItem(1);
    const selected = sinon.spy();
    const unsubscribe = canvasBus.editorProseSelectState.subscribe(selected);
    selected.resetHistory();
    try {
      itemField(1, 'Title').querySelector('input').dispatchEvent(new Event('click', { bubbles: true }));
      expect(selected.called).to.equal(false);
      const list = itemField(1, 'List');
      const drag = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(drag, 'dataTransfer', { value: { setData: sinon.spy() } });
      list.querySelector('.ew-block-item').dispatchEvent(drag);
      expect(el._dragSource).to.equal(null);
      expect(el._listDrag).not.to.equal(null);
      const over = new Event('dragover', { cancelable: true });
      Object.defineProperty(over, 'dataTransfer', { value: {} });
      const zone = list.querySelectorAll('.ew-block-drop-zone')[2];
      zone.dispatchEvent(over);
      zone.dispatchEvent(new Event('drop', { bubbles: true }));
      await el.updateComplete;
      expect(el._fields.find((field) => field.itemIndex === 1 && field.label === 'List')
        .items.map((item) => item.value)).to.deep.equal(['Second two', 'Second one']);
      expect(view.state.doc.firstChild.child(1).child(1).firstChild.textContent).to.equal('First title');
      expect(view.state.doc.firstChild.child(2).child(1).firstChild.textContent).to.equal('Second title');
      expect(el._expandedItems.has(1)).to.equal(true);
    } finally {
      unsubscribe();
    }
  });

  it('applies block-option dropdowns independently to repeating key/value rows', async () => {
    await setMultiTemplate();
    blockOptions = [{ blocks: 'hero', key: 'Color', values: 'Green=green|Blue=blue' }];
    const fields = '<table><tr><td colspan="2">fields</td></tr><tr><td>IGNORE</td><td>Color</td></tr></table>';
    html = `<body><div><h2>Hero</h2><div class="hero left">
      <div><div><p>Color</p></div><div><p>green</p></div></div>
      <div><div><p>Color</p></div><div><p>blue</p></div></div>
      </div><div class="library-metadata"><div><div>fields</div><div>${fields}</div></div></div>
      </div></body>`;
    const container = document.createElement('div');
    container.innerHTML = `<table><tr><td colspan="2">Hero (left)</td></tr>
      <tr><td><p>Color</p></td><td><p>green</p></td></tr>
      <tr><td><p>Color</p></td><td><p>blue</p></td></tr></table>`;
    const table = PMDOMParser.fromSchema(view.state.schema).parse(container).firstChild;
    const tr = view.state.tr.replaceWith(0, view.state.doc.firstChild.nodeSize, table);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    el._refresh();
    await Promise.all([el._loadFields(), el._loadMultiBlock()]);
    await expandItem(0);
    await expandItem(1);
    expect(itemField(0, 'Color').querySelector('nx-picker').value).to.equal('green');
    const picker = itemField(1, 'Color').querySelector('nx-picker');
    expect(picker.value).to.equal('blue');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'green' } }));
    await el.updateComplete;
    expect(el._fields.map((field) => field.value)).to.deep.equal(['green', 'green']);
    expect(view.state.doc.firstChild.child(1)).to.equal(table.child(1));
    expect(view.state.doc.firstChild.child(2).firstChild).to.equal(table.child(2).firstChild);
  });

  it('auto-sends multi-aware generation instructions and a valid first-item-only example', async () => {
    await setMultiTemplate(null);
    expect(generateButton()).not.to.equal(null);
    const opened = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    try {
      generateButton().click();
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
    const { options } = opened.firstCall.args[0].detail;
    expect(options.autoSend).to.equal(true);
    for (const fragment of [
      'Multi-item block: yes', 'ONLY the first item row', 'exactly two rows',
      'Every repeating item reuses this schema', 'do not duplicate the metadata rows',
      'Library template sample items: 2',
    ]) expect(options.text).to.include(fragment);
    const example = options.text.slice(
      options.text.indexOf('<div class="cards">'),
      options.text.indexOf('\nAdapt the rows'),
    );
    const container = document.createElement('div');
    container.innerHTML = example;
    const { dom } = htmlToProse(`<body><main><div>${example}</div></main></body>`);
    const blockContainer = document.createElement('div');
    blockContainer.append(dom.querySelector('table').cloneNode(true));
    const template = PMDOMParser.fromSchema(view.state.schema).parse(blockContainer).firstChild;
    const definitions = buildBlockFieldDefinitions({ item: { fields: container.querySelector('.library-metadata table') }, template }, { multi: true });
    expect(template.childCount).to.equal(4);
    expect(container.querySelector('.library-metadata table').rows.length).to.equal(2);
    expect(definitions.map((field) => field.label)).to.deep.equal(['Image', 'Title', 'Price', 'Link']);
    expect(resolveBlockFields({ node: template, from: 0 }, definitions, { itemIndex: 1 })[1].value)
      .to.equal('Second title');
    expect(resolveBlockFields({ node: template, from: 0 }, definitions, { itemIndex: 2 })[1].value)
      .to.equal('Third title');
    html = multiLibraryHtml();
    await el._onRefreshLibrary();
    await el.updateComplete;
    expect(generateButton()).to.equal(null);
    expect(el.shadowRoot.querySelectorAll('.ew-block-item-toggle').length).to.equal(2);
    await expandItem(1);
    expect(itemField(1, 'Title').querySelector('input').value).to.equal('Second title');
  });

  it('offers targeted repair when all three sample Cards have separate metadata rows', async () => {
    const container = document.createElement('div');
    container.innerHTML = cardsFieldsTable;
    const fields = container.firstChild;
    fields.tBodies[0].append(fields.rows[1].cloneNode(true), fields.rows[1].cloneNode(true));
    await setCardsTemplate(fields.outerHTML);
    const { doc } = view.state;
    expect(el._isMulti).to.equal(true);
    expect(generateButton().textContent.trim()).to.equal('Repair fields');
    expect(el._fieldError).to.include('exactly two rows');
    expect(el._fieldError).to.include('3 sample items');
    expect(el.shadowRoot.querySelectorAll('.ew-block-multi-item').length).to.equal(3);
    expect(el.shadowRoot.querySelector('.ew-block-item-toggle')).to.equal(null);
    const opened = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    try {
      generateButton().click();
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
    const { options } = opened.firstCall.args[0].detail;
    expect(options.text).to.include('Multi-item block: yes');
    expect(options.text).to.include('Existing fields metadata failed sidebar validation');
    expect(options.text).to.include('Inspect and repair ONLY this variant');
    expect(options.text).to.include('do not overwrite valid fields in other variants');
    expect(options.text).not.to.include('report them rather than overwriting them');
    expect(view.state.doc).to.equal(doc);
    html = cardsLibraryHtml();
    await el._onRefreshLibrary();
    await el.updateComplete;
    expect(el._fieldError).to.equal('');
    expect(generateButton()).to.equal(null);
    expect(el.shadowRoot.querySelectorAll('.ew-block-item-toggle').length).to.equal(3);
    expect(view.state.doc).to.equal(doc);
    await expandItem(2);
    expect(itemField(2, 'Title').querySelector('input').value).to.equal('Third title');
  });

  const setKeyValueTemplate = async (value = 'green', templateValue = value, key = 'Color') => {
    const fields = fieldsTable.replace(
      '<tr><td><p>title</p><p>subheading</p></td></tr>',
      '<tr><td><p>IGNORE</p></td><td><p>Background</p></td></tr>',
    );
    html = libraryHtml(fields).replace(
      '<div><div><h1>Template title</h1><p>Template subheading</p></div></div>',
      `<div><div><p>${key}</p></div><div><p>${templateValue}</p></div></div>`,
    );
    const container = document.createElement('div');
    container.innerHTML = `<table><tr><td colspan="2">Hero (left)</td></tr>
      <tr><td colspan="2"><p><img src="/current.png"></p></td></tr>
      <tr><td><p>${key}</p></td><td><p>${value}</p></td></tr></table><p>Outside block</p>`;
    const doc = PMDOMParser.fromSchema(view.state.schema).parse(container);
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    await el._loadFields();
    el._refresh();
    await el.updateComplete;
  };

  it('renders matching key/value options as a picker and saves stored values with marks intact', async () => {
    blockOptions = [{ blocks: ' HERO ', key: ' COLOR ', values: 'Green=green|Blue=blue' }];
    await setKeyValueTemplate('<strong>green</strong>');
    const picker = fieldElement('Background').querySelector('nx-picker');
    expect(picker).not.to.equal(null);
    expect(fieldElement('Background').querySelector('input')).to.equal(null);
    expect(picker.items).to.deep.equal([
      { label: 'Green', value: 'green' }, { label: 'Blue', value: 'blue' },
    ]);
    expect(picker.value).to.equal('green');
    const field = el._fields[1];
    const keyCell = view.state.doc.firstChild.child(2).firstChild;
    const { marks } = field.node.firstChild;
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'blue' } }));
    await el.updateComplete;
    expect(el._fields[1].value).to.equal('blue');
    expect(el._fields[1].node.firstChild.marks).to.deep.equal(marks);
    expect(view.state.doc.firstChild.child(2).firstChild).to.equal(keyCell);
    expect(view.state.doc.lastChild.textContent).to.equal('Outside block');
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
  });

  it('honors normalized option keys, all-block defaults and block-specific overrides', async () => {
    blockOptions = [
      { blocks: 'all', key: 'Color Name', values: 'Default=default' },
      { blocks: 'hero', key: 'Color Name', values: 'Green=green|Blue=blue' },
    ];
    await setKeyValueTemplate('green', 'green', ' Color   Name ');
    expect(fieldElement('Background').querySelector('nx-picker').items.map((item) => item.value))
      .to.deep.equal(['green', 'blue']);
    blockOptions = [{ blocks: 'all', key: 'color name', values: 'Default=default' }];
    await setKeyValueTemplate('default', 'default', 'Color Name');
    expect(fieldElement('Background').querySelector('nx-picker').items)
      .to.deep.equal([{ label: 'Default', value: 'default' }]);
  });

  it('leaves unmatched keys and options for other blocks as text fields', async () => {
    blockOptions = [{ blocks: 'cards', key: 'Color', values: 'Green=green|Blue=blue' }];
    await setKeyValueTemplate();
    expect(fieldElement('Background').querySelector('nx-picker')).to.equal(null);
    expect(fieldElement('Background').querySelector('input').value).to.equal('green');
    blockOptions = [{ blocks: 'hero', key: 'Size', values: 'Large|Small' }];
    await setKeyValueTemplate();
    expect(fieldElement('Background').querySelector('nx-picker')).to.equal(null);
  });

  it('shows unconfigured current values without overwriting them on load', async () => {
    blockOptions = [{ blocks: 'hero', key: 'Color', values: 'Green=green|Blue=blue' }];
    await setKeyValueTemplate('Custom color');
    const picker = fieldElement('Background').querySelector('nx-picker');
    expect(picker.value).to.equal('Custom color');
    expect(picker.labelOverride).to.equal('Custom color');
    expect(el._fields[1].value).to.equal('Custom color');
  });

  it('rejects stale dropdown changes after the row key changes', async () => {
    blockOptions = [
      { blocks: 'hero', key: 'Color', values: 'Green=green|Blue=blue' },
      { blocks: 'hero', key: 'Theme', values: 'Light=light|Dark=dark' },
    ];
    await setKeyValueTemplate();
    const picker = fieldElement('Background').querySelector('nx-picker');
    const { tr } = view.state;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'Color') {
        tr.insertText('Theme', pos + 1, pos + 1 + node.content.size);
      }
    });
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    const { doc } = view.state;
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'blue' } }));
    expect(view.state.doc).to.equal(doc);
    expect(el._fields[1].value).to.equal('green');
    expect(el._fields[1].values.map((item) => item.value)).to.deep.equal(['light', 'dark']);
  });

  it('keeps option pickers inert for mixed current content and read-only documents', async () => {
    blockOptions = [{ blocks: 'hero', key: 'Color', values: 'Green=green|Blue=blue' }];
    await setKeyValueTemplate('Plain <strong>bold</strong>');
    let picker = fieldElement('Background').querySelector('nx-picker');
    expect(picker.hasAttribute('inert')).to.equal(true);
    let { doc } = view.state;
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'blue' } }));
    expect(view.state.doc).to.equal(doc);
    await setKeyValueTemplate();
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    picker = fieldElement('Background').querySelector('nx-picker');
    expect(picker.hasAttribute('inert')).to.equal(true);
    ({ doc } = view.state);
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'blue' } }));
    expect(view.state.doc).to.equal(doc);
  });

  it('loads the everything block through the real library conversion and keeps all field positions', async () => {
    const content = `<h1>Hello World</h1><p>Foo bar baz</p>
      <picture><source srcset="/template.png"><img src="/template.png" loading="lazy"></picture>
      <ul><li>List</li><li>Item 2</li><li>Item 3</li></ul>
      <blockquote><p>A quote?</p></blockquote>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        Sed do eiusmod tempor incididunt ut <a href="https://google.com">veniam</a>.</p>
      <p><a href="https://google.com">A link</a></p>`;
    const metadata = `<table><tr><td colspan="2" data-colwidth="272,0"><p>fields</p></td></tr>
      <tr><td colspan="2"><p>title</p><p>tagline</p><p>image</p><p>list below image</p>
        <p>quote</p><p>long paragraph</p><p>link</p></td></tr>
      <tr><td><p>IGNORE</p></td><td><p>Color</p></td></tr>
      <tr><td><p>Left Column</p></td><td><p>Right Column</p></td></tr></table>`;
    html = `<body><header></header><main><div><div class="hero left">
      <div><div>${content}</div></div>
      <div><div><p>Color</p></div><div><p>Green</p></div></div>
      <div><div><p>Left side</p></div><div><p>Right side</p></div></div>
      </div><div class="library-metadata"><div><div><p>fields</p></div>
      <div>${metadata}</div></div></div></div></main><footer></footer></body>`;
    const { dom } = htmlToProse(html);
    const container = document.createElement('div');
    container.append(dom.querySelector('table').cloneNode(true));
    const doc = PMDOMParser.fromSchema(view.state.schema).parse(container);
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    resetBlockLibraryCache();
    await el._loadFields();
    el._refresh();
    await el.updateComplete;
    expect(el._fieldError).to.equal('');
    expect(el._fields.every((field) => !field.error)).to.equal(true);
    expect(el._fields.map((field) => field.label)).to.deep.equal([
      'title', 'tagline', 'image', 'list below image', 'quote', 'long paragraph',
      'link', 'Color', 'Left Column', 'Right Column',
    ]);
    expect(fieldElement('quote').querySelector('input').value).to.equal('A quote?');
    expect(fieldElement('Color').querySelector('input').value).to.equal('Green');
    expect(fieldElement('long paragraph').querySelector('input').readOnly).to.equal(true);
    expect(fieldElement('link').querySelector('input[type="url"]').value).to.equal('https://google.com');
    fieldElement('list below image').querySelector('button').click();
    await el.updateComplete;
    expect(el._fields[3].items.length).to.equal(4);
    expect(fieldElement('quote').querySelector('input').value).to.equal('A quote?');
    expect(fieldElement('Right Column').querySelector('input').value).to.equal('Right side');
  });

  it('shows link text and URL and preserves all whole-text marks when either is edited', async () => {
    await setTextTemplate('<h1>Title</h1><p><strong><em><a href="/original" title="Link title">Bold link</a></em></strong></p>');
    let field = el._fields[2];
    const { marks } = field.node.firstChild;
    const inputs = fieldElement('subheading').querySelectorAll('input');
    expect(fieldElement('subheading').classList.contains('ew-block-field-group')).to.equal(true);
    expect(inputs[0].value).to.equal('Bold link');
    expect(inputs[1].value).to.equal('/original');
    inputs[0].value = 'Updated link';
    inputs[0].dispatchEvent(new Event('blur'));
    await el.updateComplete;
    [, , field] = el._fields;
    expect(field.node.firstChild.marks).to.deep.equal(marks);
    expect(field.value).to.equal('Updated link');
    const url = fieldElement('subheading').querySelector('input[type="url"]');
    url.value = 'https://example.com/new';
    url.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    [, , field] = el._fields;
    expect(field.href).to.equal('https://example.com/new');
    expect(field.node.firstChild.marks.find((mark) => mark.type.name === 'link').attrs.title)
      .to.equal('Link title');
    expect(field.node.firstChild.marks.map((mark) => mark.type.name)).to.include.members(['strong', 'em', 'link']);
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
  });

  it('keeps paragraphs up to 200 template characters editable in the rail', async () => {
    await setTextTemplate(`<h1>Title</h1><p>${'x'.repeat(200)}</p>`);
    const input = fieldElement('subheading').querySelector('input');
    expect(input.readOnly).to.equal(false);
    expect(fieldElement('subheading').getAttribute('aria-disabled')).to.equal('false');
    input.value = 'Edited longer paragraph';
    input.dispatchEvent(new Event('blur'));
    expect(el._fields[2].value).to.equal('Edited longer paragraph');
  });

  it('edits long paragraphs in a resizable textarea while preserving marks and link attributes', async () => {
    const text = 'x'.repeat(201);
    await setTextTemplate(`<h1>Title</h1><p><strong><a href="/link" title="Link title">${text}</a></strong></p>`);
    const group = fieldElement('subheading');
    const textarea = group.querySelector('textarea');
    expect(textarea.value).to.equal(text);
    expect(textarea.readOnly).to.equal(false);
    expect(group.getAttribute('aria-disabled')).to.equal('false');
    expect(group.querySelector('input[type="text"]')).to.equal(null);
    const cssPath = '/blocks/canvas/ew-block-properties/ew-block-properties.css';
    fetchStub.withArgs(cssPath).callThrough();
    const response = await fetch(cssPath);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    const style = getComputedStyle(textarea);
    expect(parseFloat(style.minHeight)).to.be.at.least(96);
    expect(style.resize).to.equal('vertical');
    const before = el._fields[2].node;
    textarea.value = 'Edited\nparagraph';
    textarea.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    let field = el._fields[2];
    expect(field.value).to.equal('Edited\nparagraph');
    expect(field.node.attrs).to.deep.equal(before.attrs);
    expect(field.node.firstChild.marks).to.deep.equal(before.firstChild.marks);
    const url = fieldElement('subheading').querySelector('input[type="url"]');
    url.value = '/new';
    url.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    [, , field] = el._fields;
    expect(field.href).to.equal('/new');
    expect(field.node.firstChild.marks.find((mark) => mark.type.name === 'link').attrs.title)
      .to.equal('Link title');
    expect(field.node.firstChild.marks.some((mark) => mark.type.name === 'strong')).to.equal(true);
    expect(fieldElement('subheading').querySelector('textarea').value).to.equal('Edited\nparagraph');
  });

  it('uses a textarea when current text grows beyond the short library template', async () => {
    const input = fieldElement('subheading').querySelector('input');
    input.value = 'x'.repeat(201);
    input.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    const textarea = fieldElement('subheading').querySelector('textarea');
    expect(textarea.value).to.equal('x'.repeat(201));
    expect(textarea.readOnly).to.equal(false);
  });

  it('keeps long current text editable when the library paragraph has mixed formatting', async () => {
    await setTextTemplate('<h1>Title</h1><p>Template <strong>emphasis</strong></p>');
    const field = el._fields[2];
    const { schema } = view.state;
    const paragraph = field.node.type.create(field.node.attrs, schema.text('x'.repeat(300)));
    view.dispatch(view.state.tr.replaceWith(field.pos, field.pos + field.node.nodeSize, paragraph));
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const group = fieldElement('subheading');
    const textarea = group.querySelector('textarea');
    expect(textarea.readOnly).to.equal(false);
    expect(group.getAttribute('aria-disabled')).to.equal('false');
    textarea.value = 'Changed long paragraph';
    textarea.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(el._fields[2].value).to.equal('Changed long paragraph');
  });

  it('prevents textarea edits in read-only documents and rejects stale textarea blurs', async () => {
    await setTextTemplate(`<h1>Title</h1><p>${'x'.repeat(201)}</p>`);
    const stale = fieldElement('subheading').querySelector('textarea');
    el._commitText(el._fields[2], 'External change');
    const { doc } = view.state;
    stale.value = 'Stale change';
    stale.dispatchEvent(new Event('blur'));
    expect(view.state.doc).to.equal(doc);
    await el.updateComplete;
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const textarea = fieldElement('subheading').querySelector('textarea');
    expect(textarea.readOnly).to.equal(true);
    textarea.value = 'Do not save';
    textarea.dispatchEvent(new Event('blur'));
    expect(view.state.doc).to.equal(doc);
  });

  it('edits long list items in textareas without changing neighboring items', async () => {
    await setTextTemplate(`<ul><li>${'x'.repeat(201)}</li><li>Short</li></ul><p>After list</p>`);
    const textarea = fieldElement('title').querySelector('textarea');
    expect(textarea.readOnly).to.equal(false);
    textarea.value = 'Updated long item';
    textarea.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(el._fields[1].items.map((item) => item.value)).to.deep.equal(['Updated long item', 'Short']);
    expect(el._fields[2].value).to.equal('After list');
  });

  it('uses the same textarea control inside an expanded repeating item', async () => {
    await setMultiTemplate();
    const field = el._fields.find((item) => item.itemIndex === 1 && item.label === 'Title');
    el._commitText(field, 'x'.repeat(201));
    await el.updateComplete;
    await expandItem(1);
    const textarea = itemField(1, 'Title').querySelector('textarea');
    expect(textarea.readOnly).to.equal(false);
    textarea.value = 'Updated repeated title';
    textarea.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(el._fields.find((item) => item.itemIndex === 0 && item.label === 'Title').value)
      .to.equal('First title');
    expect(el._fields.find((item) => item.itemIndex === 1 && item.label === 'Title').value)
      .to.equal('Updated repeated title');
  });

  it('hides IGNORE and grays out mixed text without permitting programmatic edits', async () => {
    await setTextTemplate(
      '<h1>Ignore this</h1><p>Some <a href="/link">linked</a> text</p>',
      '<p>IGNORE</p><p>subheading</p>',
    );
    expect(fieldElement('IGNORE')).to.equal(null);
    expect(fieldElement('subheading').getAttribute('aria-disabled')).to.equal('true');
    expect(fieldElement('subheading').querySelector('input').readOnly).to.equal(true);
    const { doc } = view.state;
    el._commitText(el._fields[1], 'Do not save');
    el._commitLink(el._fields[1], '/new');
    expect(view.state.doc).to.equal(doc);
  });

  it('groups list inputs and supports adding, editing, keyboard and drag reordering', async () => {
    await setTextTemplate('<ol start="3"><li><strong><a href="/one">First</a></strong></li><li>Second</li><li>Third</li></ol><p>After list</p>');
    let field = el._fields[1];
    const listElement = () => fieldElement('title');
    expect(listElement().querySelectorAll('.ew-block-item').length).to.equal(3);
    expect(listElement().classList.contains('ew-block-field-group')).to.equal(true);
    expect(listElement().querySelector('h4').classList.contains('nx-form-field')).to.equal(true);
    expect(listElement().querySelectorAll('.ew-block-drop-zone').length).to.equal(4);
    expect(listElement().querySelector('input').value).to.equal('First');
    const originalItem = field.node.firstChild;
    const listAttrs = field.node.attrs;
    const drag = listElement().querySelector('.ew-block-item');
    const dragEvent = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragEvent, 'dataTransfer', { value: { setData: sinon.spy() } });
    drag.dispatchEvent(dragEvent);
    const dropZone = listElement().querySelectorAll('.ew-block-drop-zone')[3];
    const dragOver = new Event('dragover', { cancelable: true });
    Object.defineProperty(dragOver, 'dataTransfer', { value: {} });
    dropZone.dispatchEvent(dragOver);
    await el.updateComplete;
    expect(dragOver.defaultPrevented).to.equal(true);
    expect(dropZone.hasAttribute('data-drop-active')).to.equal(true);
    expect(listElement().querySelector('.ew-block-item').classList.contains('is-dragging')).to.equal(true);
    dropZone.dispatchEvent(new Event('drop'));
    await el.updateComplete;
    [, field] = el._fields;
    expect(field.items.map((item) => item.value)).to.deep.equal(['Second', 'Third', 'First']);
    expect(field.node.child(2)).to.equal(originalItem);
    expect(field.node.attrs).to.deep.equal(listAttrs);
    expect(listElement().querySelector('[data-drop-active]')).to.equal(null);
    listElement().querySelectorAll('.ew-block-item')[2].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }),
    );
    await el.updateComplete;
    expect(el._fields[1].items.map((item) => item.value)).to.deep.equal(['Second', 'First', 'Third']);
    listElement().querySelector('button').click();
    await el.updateComplete;
    expect(el._fields[1].items.map((item) => item.value)).to.deep.equal(['Second', 'First', 'Third', '']);
    const input = listElement().querySelectorAll('.ew-block-list-item input[type="text"]')[3];
    input.value = 'Added item';
    input.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(el._fields[1].items[3].value).to.equal('Added item');
    expect(el._fields[2].value).to.equal('After list');
    expect(view.state.doc.lastChild.textContent).to.equal('Outside block');
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
  });

  it('rejects stale list drops and read-only list mutations', async () => {
    await setTextTemplate('<ul><li>First</li><li>Second</li></ul><p>After</p>');
    const field = el._fields[1];
    const target = el._captureField(field);
    el._listDrag = { target, key: field.key, index: 0 };
    el._changeList(field, null);
    const { doc } = view.state;
    fieldElement('title').querySelectorAll('.ew-block-drop-zone')[2].dispatchEvent(new Event('drop'));
    expect(view.state.doc).to.equal(doc);
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect(fieldElement('title').querySelector('button').disabled).to.equal(true);
    el._changeList(el._fields[1], null);
    expect(view.state.doc).to.equal(doc);
  });

  it('deletes list items while preserving neighbors and keeps the last item editable', async () => {
    await setTextTemplate('<ol start="3"><li>First</li><li><strong><a href="/two">Second</a></strong></li><li>Third</li></ol><p>After list</p>');
    const list = fieldElement('title');
    const { node } = el._fields[1];
    list.querySelectorAll('.ew-block-list-delete')[0].click();
    await el.updateComplete;
    expect(el._fields[1].items.map((item) => item.value)).to.deep.equal(['Second', 'Third']);
    expect(el._fields[1].node.firstChild).to.equal(node.child(1));
    expect(el._fields[1].node.attrs).to.deep.equal(node.attrs);
    expect(el._fields[2].value).to.equal('After list');
    expect(view.state.doc.lastChild.textContent).to.equal('Outside block');
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
    list.querySelectorAll('.ew-block-list-delete')[1].click();
    await el.updateComplete;
    expect(el._fields[1].items.map((item) => item.value)).to.deep.equal(['Second']);
    const deleteButton = list.querySelector('.ew-block-list-delete');
    expect(deleteButton.disabled).to.equal(true);
    expect(list.querySelector('input').readOnly).to.equal(false);
    const { doc } = view.state;
    deleteButton.click();
    el._changeList(el._fields[1], 0, null);
    expect(view.state.doc).to.equal(doc);
    list.querySelector('button').click();
    await el.updateComplete;
    expect(el._fields[1].items.length).to.equal(2);
    expect([...list.querySelectorAll('.ew-block-list-delete')].every((button) => !button.disabled))
      .to.equal(true);
  });

  it('rejects stale and read-only list deletions', async () => {
    await setTextTemplate('<ul><li>First</li><li>Second</li><li>Third</li></ul><p>After</p>');
    const field = el._fields[1];
    el._changeList(field, 0, null);
    let { doc } = view.state;
    el._changeList(field, 0, null);
    expect(view.state.doc).to.equal(doc);
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect([...fieldElement('title').querySelectorAll('.ew-block-list-delete')]
      .every((button) => button.disabled)).to.equal(true);
    ({ doc } = view.state);
    el._changeList(el._fields[1], 0, null);
    expect(view.state.doc).to.equal(doc);
  });

  it('matches field typography, groups links and lists, and shows blue lines in the item gaps', async () => {
    await setTextTemplate('<ul><li>First</li><li>Second</li></ul><p><a href="/link">Link</a></p>');
    const cssPath = '/blocks/canvas/ew-block-properties/ew-block-properties.css';
    fetchStub.withArgs(cssPath).callThrough();
    const response = await fetch(cssPath);
    const formStyle = new CSSStyleSheet();
    formStyle.replaceSync('.nx-form-field { font-size: 18px; color: #606060; }');
    const style = new CSSStyleSheet();
    style.replaceSync(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, formStyle, style];
    el.style.setProperty('--s2-component-s-regular-font-size', '13px');
    el.style.setProperty('--s2-gray-300', '#d5d5d5');
    el.style.setProperty('--s2-corner-radius-500', '8px');
    el.style.setProperty('--s2-spacing-100', '8px');
    el.style.setProperty('--s2-blue-600', '#1473e6');
    const heading = getComputedStyle(fieldElement('title').querySelector('h4'));
    const label = getComputedStyle(fieldElement('subheading').querySelector('label'));
    for (const property of ['fontSize', 'fontWeight', 'color']) {
      expect(heading[property]).to.equal(label[property]);
    }
    for (const group of [fieldElement('title'), fieldElement('subheading')]) {
      const groupStyle = getComputedStyle(group);
      expect(groupStyle.borderTopWidth).to.equal('1px');
      expect(groupStyle.borderTopColor).to.equal('rgb(213, 213, 213)');
      expect(groupStyle.borderRadius).to.equal('8px');
    }
    const zones = fieldElement('title').querySelectorAll('.ew-block-drop-zone');
    expect(getComputedStyle(zones[1]).height).to.equal('8px');
    el._listDrop = { key: el._fields[1].key, index: 1 };
    await el.updateComplete;
    const indicator = getComputedStyle(zones[1], '::after');
    expect(indicator.height).to.equal('2px');
    expect(indicator.backgroundColor).to.equal('rgb(20, 115, 230)');
    fieldElement('title').querySelector('.ew-block-list-delete').click();
    await el.updateComplete;
    const deleteButton = fieldElement('title').querySelector('.ew-block-list-delete');
    expect(deleteButton.disabled).to.equal(true);
    expect(getComputedStyle(deleteButton).opacity).to.equal('0.5');
    el._clearListDragState();
    await el.updateComplete;
    expect(fieldElement('title').querySelector('[data-drop-active]')).to.equal(null);
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
