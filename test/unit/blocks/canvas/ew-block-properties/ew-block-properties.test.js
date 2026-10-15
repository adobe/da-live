import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { getNx, setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { makeView } from '../test-helpers.js';
import { setTableBlockVariant } from '../../../../../blocks/canvas/editor-utils/blocks.js';
import { setDaConfigs } from '../../../../fixtures/nx/utils/daConfig.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getExtensionsBridge;
let resetBlockLibraryCache;
let resetBlockOptionsCache;
let hashChange;
let handleCursorMove;
let handleIframeSelectionChange;

before(async () => {
  await import('../../../../../blocks/canvas/ew-block-properties/ew-block-properties.js');
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
  ({ resetBlockLibraryCache, resetBlockOptionsCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js'));
  ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  ({ handleCursorMove, handleIframeSelectionChange } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/utils/handlers.js'));
});

function table(name) {
  const cell = (text) => ({
    type: 'table_cell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  return {
    type: 'table',
    content: [
      { type: 'table_row', content: [cell(name)] },
      { type: 'table_row', content: [cell('Block content')] },
    ],
  };
}

describe('ew-block-properties', () => {
  let el;
  let view;

  beforeEach(async () => {
    view = makeView({
      type: 'doc',
      content: [
        table('Hero (dark, wide)'), table('Cards'),
        { type: 'paragraph', content: [{ type: 'text', text: 'Outside blocks' }] },
      ],
    });
    view.focus = sinon.spy();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
    getExtensionsBridge().view = view;
    canvasBus.editorHtmlState.emit('<div>Document</div>');
    el = document.createElement('ew-block-properties');
    document.body.append(el);
    await el.updateComplete;
    resetBlockLibraryCache();
    resetBlockOptionsCache();
  });

  afterEach(() => {
    el.remove();
    document.querySelector('ew-block-library-modal')?.remove();
    getExtensionsBridge().view = null;
    setDaConfigs([]);
    hashChange._set({});
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    sinon.restore();
  });

  function configureLibrary() {
    setDaConfigs([{ library: { data: [{ title: 'Blocks', path: 'http://localhost:2000/mock-blocks.json' }] } }]);
    sinon.stub(window, 'fetch').callsFake(async () => new Response(
      JSON.stringify({ data: [] }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    hashChange._set({ org: 'testorg', site: 'testsite' });
  }

  function configureVariantLibrary(heroHtml = `
    <body>
      <div><h2>Hero (dark, wide)</h2><div class="hero dark wide"><div><div>Dark content</div></div></div></div>
      <div><h2>Hero (compact)</h2><div class="hero compact"><div><div>Compact content</div></div></div></div>
    </body>`) {
    setDaConfigs([{ library: { data: [{ title: 'Blocks', path: 'http://localhost:2000/mock-blocks.json' }] } }]);
    sinon.stub(window, 'fetch').callsFake(async (url) => {
      if (String(url).endsWith('.json')) {
        return new Response(JSON.stringify({
          data: [
            { name: 'Hero', path: 'http://localhost:2000/mock-hero.html' },
            { name: 'Cards', path: 'http://localhost:2000/mock-cards.html' },
          ],
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      const html = String(url).includes('mock-hero')
        ? await heroHtml
        : '<body><div><h2>Cards (bordered)</h2><div class="cards bordered"><div><div>Cards content</div></div></div></div></body>';
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    });
    hashChange._set({ org: 'testorg', site: 'testsite' });
  }

  it('loads the same library variants as the toolbar into a field-style picker', async () => {
    configureVariantLibrary();
    await el._loadVariants();
    await el.updateComplete;
    const picker = el.shadowRoot.querySelector('nx-picker');
    expect(picker).to.exist;
    expect(picker.getAttribute('variant')).to.equal('field');
    expect(picker.items).to.deep.equal([
      { value: '', label: 'No variant' },
      { value: 'dark, wide', label: 'dark, wide' },
      { value: 'compact', label: 'compact' },
    ]);
    expect(picker.value).to.equal('dark, wide');
    expect(picker.labelOverride).to.equal('');
  });

  it('changes the selected block variant while preserving its name and content', async () => {
    configureVariantLibrary();
    await el._loadVariants();
    await el.updateComplete;
    const picker = el.shadowRoot.querySelector('nx-picker');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'compact' } }));
    await el.updateComplete;
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
    expect(view.state.selection.node.firstChild.textContent).to.equal('Hero (compact)');
    expect(view.state.selection.node.child(1).textContent).to.equal('Block content');
    expect(view.state.doc.child(1).firstChild.textContent).to.equal('Cards');
    expect(picker.value).to.equal('compact');
    expect(view.focus.calledOnce).to.be.true;
  });

  it('removes the variant with the No variant option', async () => {
    configureVariantLibrary();
    await el._loadVariants();
    await el.updateComplete;
    const picker = el.shadowRoot.querySelector('nx-picker');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));
    await el.updateComplete;
    expect(view.state.selection.node.firstChild.textContent).to.equal('Hero');
    expect(picker.value).to.equal('');
    expect(picker.labelOverride).to.equal('');
  });

  it('preserves custom variant labels and matches known variants ignoring case', async () => {
    configureVariantLibrary();
    await el._loadVariants();
    setTableBlockVariant(view, 'custom');
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const picker = el.shadowRoot.querySelector('nx-picker');
    expect(picker.value).to.equal('');
    expect(picker.labelOverride).to.equal('custom');
    setTableBlockVariant(view, 'COMPACT');
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect(picker.value).to.equal('compact');
    expect(picker.labelOverride).to.equal('');
  });

  it('refreshes variant options when a different block is selected', async () => {
    configureVariantLibrary();
    await el._loadVariants();
    view.dispatch(view.state.tr.setSelection(
      NodeSelection.create(view.state.doc, view.state.doc.firstChild.nodeSize),
    ));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: false, block: { name: 'cards' } });
    await el._loadVariants();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-picker').items).to.deep.equal([
      { value: '', label: 'No variant' },
      { value: 'bordered', label: 'bordered' },
    ]);
  });

  it('hides the picker when the block has no configured variants, like the toolbar', async () => {
    configureLibrary();
    await el._loadVariants();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-picker')).to.be.null;
  });

  it('prevents changing variants in a read-only document', async () => {
    configureVariantLibrary();
    await el._loadVariants();
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const { doc } = view.state;
    expect(el.shadowRoot.querySelector('.ew-block-variant').hasAttribute('inert')).to.be.true;
    el.shadowRoot.querySelector('nx-picker')
      .dispatchEvent(new CustomEvent('change', { detail: { value: 'compact' } }));
    expect(view.state.doc).to.equal(doc);
    expect(view.focus.called).to.be.false;
  });

  it('discards pending variant options after the block is deselected', async () => {
    let resolve;
    configureVariantLibrary(new Promise((done) => { resolve = done; }));
    const loading = el._loadVariants();
    const outside = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize + 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, outside)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    resolve('<body><div><h2>Hero (compact)</h2><div class="hero compact"><div><div>Content</div></div></div></div></body>');
    await loading;
    await el.updateComplete;
    expect(el._variantOptions).to.deep.equal([]);
    expect(el.shadowRoot.querySelector('nx-picker')).to.be.null;
  });

  it('shows the already-selected block in a button, not an editable input', () => {
    const button = el.shadowRoot.querySelector('button');
    expect(el.shadowRoot.querySelector('.ew-pm-header')).to.be.null;
    expect(el.shadowRoot.querySelector('.ew-pm-control > span').textContent).to.equal('Block');
    expect(el.shadowRoot.querySelector('input')).to.be.null;
    expect(button.textContent).to.equal('hero');
    expect(button.type).to.equal('button');
    expect(button.disabled).to.be.false;
    expect(button.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(button.getAttribute('aria-label')).to.equal('Open block library for hero');
    const icon = button.querySelector('svg');
    expect(icon.getAttribute('aria-hidden')).to.equal('true');
    expect(icon.querySelector('use').getAttribute('href')).to.equal('/img/icons/s2-icon-switch-20-n.svg#icon');
  });

  it('wires clicking the name button to opening the library', async () => {
    const open = sinon.stub(el, '_openLibrary').resolves();
    el.requestUpdate();
    await el.updateComplete;
    el.shadowRoot.querySelector('button').click();
    expect(open.calledOnce).to.be.true;
  });

  it('opens the existing block library without changing the document', async () => {
    configureLibrary();
    const { doc } = view.state;
    await el._openLibrary();
    const modal = document.querySelector('ew-block-library-modal');
    expect(modal).to.exist;
    expect(modal.heading).to.equal('Replace block');
    expect(modal.onInsert).to.be.a('function');
    expect(view.state.doc).to.equal(doc);
  });

  it('uses the library selection to replace only the selected block', async () => {
    configureLibrary();
    await el._openLibrary();
    const dom = document.createElement('div');
    dom.innerHTML = '<table><tbody><tr><td>Teaser</td></tr><tr><td>New content</td></tr></tbody></table>';
    document.querySelector('ew-block-library-modal').onInsert(dom);
    expect(view.state.doc.firstChild.firstChild.textContent).to.equal('Teaser');
    expect(view.state.doc.firstChild.child(1).textContent).to.equal('New content');
    expect(view.state.doc.child(1).firstChild.textContent).to.equal('Cards');
    expect(view.focus.calledOnce).to.be.true;
  });

  it('does not replace a block after navigating away from its document', async () => {
    configureLibrary();
    await el._openLibrary();
    const { doc } = view.state;
    getExtensionsBridge().view = null;
    document.querySelector('ew-block-library-modal').onInsert(document.createElement('div'));
    expect(view.state.doc).to.equal(doc);
  });

  it('does not replace a changed block using a stale library selection', async () => {
    configureLibrary();
    await el._openLibrary();
    view.dispatch(view.state.tr.insertText('Banner', 4, 8));
    const { doc } = view.state;
    document.querySelector('ew-block-library-modal').onInsert(document.createElement('div'));
    expect(view.state.doc).to.equal(doc);
  });

  it('tracks selection changes from both editing surfaces', async () => {
    for (const surface of ['doc', 'wysiwyg']) {
      const pos = surface === 'doc' ? view.state.doc.firstChild.nodeSize : 0;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      canvasBus.toolbarSelectionState.emit({ surface, showable: false, block: { name: 'block' } });
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('button').textContent).to.equal(surface === 'doc' ? 'cards' : 'hero');
    }
  });

  it('shows the enclosing block for cursors and text ranges without changing the selection', async () => {
    const bodyPos = view.state.doc.firstChild.firstChild.nodeSize + 4;
    for (const surface of ['doc', 'wysiwyg']) {
      for (const [from, to] of [[4, 4], [bodyPos, bodyPos], [bodyPos, bodyPos + 5]]) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
        const { selection } = view.state;
        canvasBus.toolbarSelectionState.emit({ surface, showable: true });
        await el.updateComplete;
        expect(el.shadowRoot.querySelector('.ew-block-name').textContent).to.equal('hero');
        expect(el._variant).to.equal('dark, wide');
        expect(view.state.selection).to.equal(selection);
      }
    }
    const cardsPos = view.state.doc.firstChild.nodeSize + 4;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cardsPos)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-block-name').textContent).to.equal('cards');
  });

  it('follows mirrored iframe cursors and text selections inside blocks', async () => {
    const ctx = { view, wsProvider: { awareness: { setLocalStateField: sinon.spy() } } };
    const bodyPos = view.state.doc.firstChild.firstChild.nodeSize + 4;
    handleCursorMove({ cursorOffset: bodyPos, textCursorOffset: 2 }, ctx);
    await el.updateComplete;
    expect(view.state.selection).to.be.instanceOf(TextSelection);
    expect(el.shadowRoot.querySelector('.ew-block-name').textContent).to.equal('hero');

    const cardsPos = view.state.doc.firstChild.nodeSize + 4;
    handleIframeSelectionChange({ anchor: cardsPos, head: cardsPos + 3 }, ctx);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-block-name').textContent).to.equal('cards');
  });

  it('shows the enclosing block when an inline image is selected', async () => {
    const pos = view.state.doc.firstChild.firstChild.nodeSize + 4;
    const image = view.state.schema.nodes.image.create({ src: '/preview.png' });
    const tr = view.state.tr.insert(pos, image);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-block-name').textContent).to.equal('hero');
    expect(view.state.selection.node.type.name).to.equal('image');
  });

  it('changes the enclosing block variant from a text selection', async () => {
    configureVariantLibrary();
    await el._loadVariants();
    const pos = view.state.doc.firstChild.firstChild.nodeSize + 4;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos, pos + 5)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el.updateComplete;
    el.shadowRoot.querySelector('nx-picker')
      .dispatchEvent(new CustomEvent('change', { detail: { value: 'compact' } }));
    expect(view.state.doc.firstChild.firstChild.textContent).to.equal('Hero (compact)');
    expect(view.state.doc.firstChild.child(1).textContent).to.equal('Block content');
    expect(view.state.doc.child(1).firstChild.textContent).to.equal('Cards');
  });

  it('replaces the enclosing block rather than its selected text', async () => {
    configureLibrary();
    const pos = view.state.doc.firstChild.nodeSize + 4;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos, pos + 3)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el._openLibrary();
    const dom = document.createElement('div');
    dom.innerHTML = '<table><tbody><tr><td>Teaser</td></tr><tr><td>New content</td></tr></tbody></table>';
    document.querySelector('ew-block-library-modal').onInsert(dom);
    expect(view.state.doc.firstChild.firstChild.textContent).to.equal('Hero (dark, wide)');
    expect(view.state.doc.child(1).firstChild.textContent).to.equal('Teaser');
    expect(view.state.doc.child(1).child(1).textContent).to.equal('New content');
    expect(view.state.doc.child(2).textContent).to.equal('Outside blocks');
  });

  it('does not target a block when a text selection spans different blocks', async () => {
    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 4, view.state.doc.firstChild.nodeSize + 4),
    ));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-block-name')).to.be.null;
    expect(el.shadowRoot.querySelector('.ew-block-empty').textContent).to.equal('Select a block');
  });

  it('refreshes the name after document changes', async () => {
    const tr = view.state.tr.insertText('Teaser', 4, 8);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('button').textContent).to.equal('teaser');
  });

  it('shows Select a block when the selection is outside all blocks', async () => {
    const outside = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize + 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, outside)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('button')).to.be.null;
    expect(el.shadowRoot.querySelector('p').textContent).to.equal('Select a block');
  });

  it('restores the name button when a block is selected again', async () => {
    const outside = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize + 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, outside)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el.updateComplete;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: false, block: { name: 'hero' } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('p')).to.be.null;
    expect(el.shadowRoot.querySelector('button').textContent).to.equal('hero');
  });

  it('shows Select a block when no editor view is available', async () => {
    getExtensionsBridge().view = null;
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('button')).to.be.null;
    expect(el.shadowRoot.querySelector('p').textContent).to.equal('Select a block');
    await el._openLibrary();
    expect(document.querySelector('ew-block-library-modal')).to.be.null;
  });

  it('disables the button and does not open the library for a read-only document', async () => {
    configureLibrary();
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('button').disabled).to.be.true;
    await el._openLibrary();
    expect(document.querySelector('ew-block-library-modal')).to.be.null;
  });

  it('does not replace a block if the document becomes read-only', async () => {
    configureLibrary();
    await el._openLibrary();
    const { doc } = view.state;
    view.editable = false;
    document.querySelector('ew-block-library-modal').onInsert(document.createElement('div'));
    expect(view.state.doc).to.equal(doc);
  });

  it('shows Select a block when the document unloads', async () => {
    canvasBus.editorHtmlState.emit('');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('button')).to.be.null;
    expect(el.shadowRoot.querySelector('p').textContent).to.equal('Select a block');
  });

  it('unsubscribes when removed and refreshes when reconnected', async () => {
    el.remove();
    const tr = view.state.tr.insertText('Teaser', 4, 8);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    canvasBus.editorDocState.emit();
    document.body.append(el);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('button').textContent).to.equal('teaser');
  });

  it('matches the gray, rounded picker-field appearance', async () => {
    const response = await fetch('/blocks/canvas/ew-block-properties/ew-block-properties.css');
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-gray-100', '#e8e8e8');
    el.style.setProperty('--s2-gray-800', '#292929');
    el.style.setProperty('--s2-corner-radius-500', '8px');
    el.style.setProperty('--s2-component-s-regular-font-size', '12px');
    el.style.setProperty('--s2-component-s-regular-line-height', '16px');
    el.style.setProperty('--s2-component-m-regular-font-size', '14px');
    el.style.setProperty('--s2-component-m-regular-line-height', '20px');
    el.style.setProperty('--s2-spacing-200', '16px');
    expect(getComputedStyle(el.shadowRoot.querySelector('.ew-page-metadata')).paddingTop)
      .to.equal('16px');
    const style = getComputedStyle(el.shadowRoot.querySelector('button'));
    expect(style.backgroundColor).to.equal('rgb(232, 232, 232)');
    expect(style.color).to.equal('rgb(41, 41, 41)');
    expect(style.height).to.equal('32px');
    expect(style.borderTopWidth).to.equal('0px');
    expect(style.borderRadius).to.equal('8px');
    expect(style.fontSize).to.equal('14px');
    expect(style.lineHeight).to.equal('20px');
    const button = el.shadowRoot.querySelector('.ew-block-name');
    const icon = button.querySelector('svg');
    expect(getComputedStyle(icon).width).to.equal('16px');
    expect(getComputedStyle(icon).height).to.equal('16px');
    expect(getComputedStyle(icon).flexShrink).to.equal('0');
    button.querySelector('span').textContent = 'A very long block name '.repeat(20);
    el.style.display = 'block';
    el.style.width = '240px';
    const label = button.querySelector('span');
    expect(getComputedStyle(label).textOverflow).to.equal('ellipsis');
    expect(label.scrollWidth).to.be.greaterThan(label.clientWidth);
    expect(icon.getBoundingClientRect().right).to.be.at.most(button.getBoundingClientRect().right);
  });
});
