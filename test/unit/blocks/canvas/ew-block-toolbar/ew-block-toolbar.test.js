import { expect } from '@esm-bundle/chai';
import { NodeSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: EwBlockToolbar } = await import('../../../../../blocks/canvas/ew-block-toolbar/ew-block-toolbar.js');
const { PANEL_EVENT } = await import('../../../../fixtures/nx/utils/panel.js');
const { makeView } = await import('../test-helpers.js');
const { setCommentsController } = await import('../../../../../blocks/canvas/editor-utils/comments-bridge.js');

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

  it('selects "No variant" when there is no current variant', async () => {
    toolbar.show('cards');
    toolbar._variantOptions = ['wide', 'blue'];
    await toolbar.updateComplete;

    const picker = toolbar.shadowRoot.querySelector('nx-picker');
    expect(picker.value).to.equal('');
    expect(picker.labelOverride).to.equal('');
  });

  it('matches the current variant case-insensitively', async () => {
    toolbar.show('cards', 'wide');
    toolbar._variantOptions = ['Wide'];
    await toolbar.updateComplete;

    const picker = toolbar.shadowRoot.querySelector('nx-picker');
    expect(picker.value).to.equal('Wide');
    expect(picker.labelOverride).to.equal('');
  });

  it('matches the current variant ignoring spacing differences', async () => {
    toolbar.show('cards', 'two up');
    toolbar._variantOptions = ['Two-Up'];
    await toolbar.updateComplete;

    const picker = toolbar.shadowRoot.querySelector('nx-picker');
    expect(picker.value).to.equal('Two-Up');
    expect(picker.labelOverride).to.equal('');
  });

  function editBtn() {
    return toolbar.shadowRoot.querySelector('.block-edit');
  }

  function addItemBtn() {
    return toolbar.shadowRoot.querySelector('.block-add-item');
  }

  it('shows the Add item button when the block has a multi template row', async () => {
    toolbar.show('cards');
    toolbar._multiTemplateRow = document.createElement('tr');
    await toolbar.updateComplete;
    expect(addItemBtn()).to.exist;
  });

  it('hides the Add item button when there is no template row', async () => {
    toolbar.show('cards');
    await toolbar.updateComplete;
    expect(addItemBtn()).to.be.null;
  });

  it('shows the edit-block button with the edit icon', async () => {
    toolbar.show('cards');
    await toolbar.updateComplete;
    expect(editBtn()).to.exist;
    const use = editBtn().querySelector('svg.icon use');
    expect(use.getAttribute('href')).to.equal('/img/icons/s2-icon-edit-20-n.svg#icon');
  });

  it('opens the Block sidebar without changing the document or claiming doc focus', async () => {
    const calls = [];
    const onOpen = ({ detail }) => calls.push(detail);
    document.addEventListener(PANEL_EVENT.OPEN, onOpen);
    try {
      const cell = (text) => ({
        type: 'table_cell',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      });
      const view = makeView({
        type: 'doc',
        content: [{
          type: 'table',
          content: [
            { type: 'table_row', content: [cell('cards')] },
            { type: 'table_row', content: [cell('content')] },
          ],
        }],
      });
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
      let focused = 0;
      view.focus = () => { focused += 1; };
      const { doc, selection } = view.state;
      toolbar.view = view;
      toolbar.show('cards');
      await toolbar.updateComplete;
      editBtn().click();
      expect(calls).to.deep.equal([{ section: 'tools', id: 'block' }]);
      expect(view.state.doc).to.equal(doc);
      expect(view.state.selection).to.equal(selection);
      expect(focused).to.equal(0);
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, onOpen);
    }
  });

  it('does not open the Block sidebar when the block selection is no longer current', async () => {
    const calls = [];
    const onOpen = ({ detail }) => calls.push(detail);
    document.addEventListener(PANEL_EVENT.OPEN, onOpen);
    try {
      toolbar.view = makeView({ type: 'doc', content: [{ type: 'paragraph' }] });
      toolbar.show('cards');
      await toolbar.updateComplete;
      editBtn().click();
      expect(calls).to.have.lengthOf(0);
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, onOpen);
    }
  });

  it('opens the comments composer for the block when the comment button is clicked', async () => {
    let composed = 0;
    setCommentsController({ requestCompose() { composed += 1; } });
    try {
      toolbar.view = { state: { selection: { from: 7 } } };
      toolbar.show('cards');
      await toolbar.updateComplete;
      const btn = toolbar.shadowRoot.querySelector('.block-comment');
      expect(btn.querySelector('svg.icon use').getAttribute('href'))
        .to.equal('/img/icons/s2-icon-comment-20-n.svg#icon');
      btn.click();
      expect(composed).to.equal(1);
      expect(toolbar.open).to.be.false;
    } finally {
      setCommentsController(null);
    }
  });
});
