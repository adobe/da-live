import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: EwBlockToolbar } = await import('../../../../../blocks/canvas/ew-block-toolbar/ew-block-toolbar.js');

describe('ew-block-toolbar', () => {
  let toolbar;

  beforeEach(() => {
    toolbar = document.createElement('ew-block-toolbar');
    document.body.append(toolbar);
  });

  afterEach(() => {
    toolbar.remove();
  });

  function replaceBtn() {
    return toolbar.shadowRoot.querySelector('.block-replace');
  }

  it('is defined', () => {
    expect(customElements.get('ew-block-toolbar')).to.equal(EwBlockToolbar);
  });

  it('shows the block name on the replace button when opened', async () => {
    toolbar.show('cards');
    await toolbar.updateComplete;

    expect(toolbar.open).to.be.true;
    const label = replaceBtn().querySelector('.block-name');
    expect(label).to.exist;
    expect(label.textContent.trim()).to.equal('cards');
  });

  it('renders the block (tableadd) icon', async () => {
    toolbar.show('cards');
    await toolbar.updateComplete;

    const use = replaceBtn().querySelector('svg.icon use');
    expect(use.getAttribute('href')).to.equal('/img/icons/s2-icon-tableadd-20-n.svg#icon');
  });

  it('falls back to "Block" when no name is given', async () => {
    toolbar.show('');
    await toolbar.updateComplete;

    expect(replaceBtn().querySelector('.block-name').textContent.trim()).to.equal('Block');
  });

  it('disables the replace button when no block library is configured', async () => {
    toolbar._hasBlockLibrary = false;
    toolbar.show('cards');
    await toolbar.updateComplete;

    expect(replaceBtn().disabled).to.be.true;
  });

  it('enables the replace button when a block library is configured', async () => {
    toolbar._hasBlockLibrary = true;
    toolbar.show('cards');
    await toolbar.updateComplete;

    expect(replaceBtn().disabled).to.be.false;
  });

  it('hides when hide is called', async () => {
    toolbar.show('cards');
    await toolbar.updateComplete;
    toolbar.hide();

    expect(toolbar.open).to.be.false;
  });

  it('shows no variant picker when the block has no variants', async () => {
    toolbar.show('cards');
    await toolbar.updateComplete;

    expect(toolbar.shadowRoot.querySelector('nx-picker')).to.be.null;
  });

  it('renders a variant picker with the available variants when present', async () => {
    toolbar.show('cards');
    toolbar._variantOptions = ['highlight', 'blue'];
    await toolbar.updateComplete;

    const picker = toolbar.shadowRoot.querySelector('nx-picker');
    expect(picker).to.exist;
    const labels = picker.items.map((i) => i.label);
    expect(labels).to.include('No variant');
    expect(labels).to.include('highlight');
    expect(labels).to.include('blue');
  });

  it('reflects the current variant on the picker', async () => {
    toolbar.show('cards', 'highlight');
    toolbar._variantOptions = ['highlight', 'blue'];
    await toolbar.updateComplete;

    expect(toolbar.shadowRoot.querySelector('nx-picker').value).to.equal('highlight');
  });

  function editBtn() {
    return toolbar.shadowRoot.querySelector('.block-edit');
  }

  it('shows the edit-block button only in layout (wysiwyg-only) mode', async () => {
    toolbar.show('cards');
    toolbar._editorView = 'layout';
    await toolbar.updateComplete;
    expect(editBtn()).to.exist;
    const use = editBtn().querySelector('svg.icon use');
    expect(use.getAttribute('href')).to.equal('/img/icons/s2-icon-edit-20-n.svg#icon');
  });

  it('hides the edit-block button in split and content mode', async () => {
    toolbar.show('cards');
    toolbar._editorView = 'split';
    await toolbar.updateComplete;
    expect(editBtn()).to.be.null;

    toolbar._editorView = 'content';
    await toolbar.updateComplete;
    expect(editBtn()).to.be.null;
  });

  it('switches to split view when the edit-block button is clicked', async () => {
    const header = document.createElement('ew-canvas-header');
    const calls = [];
    header.setEditorView = (v) => calls.push(v);
    document.body.append(header);

    toolbar.show('cards');
    toolbar._editorView = 'layout';
    await toolbar.updateComplete;
    editBtn().click();

    expect(calls).to.deep.equal(['split']);
    header.remove();
  });

  it('scrolls the doc view to the selected block after switching to split', async () => {
    const scrolled = [];
    const dom = { scrollIntoView: (opts) => scrolled.push(opts) };
    let nodeDomPos;
    toolbar.view = {
      nodeDOM: (p) => { nodeDomPos = p; return dom; },
      state: { selection: { from: 7 } },
    };
    toolbar.show('cards');
    toolbar._editorView = 'layout';
    await toolbar.updateComplete;

    editBtn().click();
    await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); });

    expect(nodeDomPos).to.equal(7);
    expect(scrolled).to.deep.equal([{ block: 'center' }]);
  });

  it('reacts to editor-view changes dispatched on the document', async () => {
    toolbar.show('cards');
    toolbar._editorView = 'layout';
    await toolbar.updateComplete;
    expect(editBtn()).to.exist;

    document.dispatchEvent(new CustomEvent('nx-canvas-editor-view', {
      bubbles: true,
      composed: true,
      detail: { view: 'split' },
    }));
    await toolbar.updateComplete;
    expect(editBtn()).to.be.null;
  });
});
