import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: EwBlockToolbar } = await import('../../../../../blocks/canvas/ew-block-toolbar/ew-block-toolbar.js');
const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');

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

  it('requests the single-block edit modal via the canvas bus when the edit button is clicked', async () => {
    const calls = [];
    const unsubscribe = canvasBus.blockEditRequest.subscribe((detail) => calls.push(detail));
    try {
      toolbar.view = { state: { selection: { from: 7 } } };
      toolbar.show('cards');
      await toolbar.updateComplete;
      editBtn().click();
      expect(calls).to.deep.equal([{ pos: 7 }]);
    } finally {
      unsubscribe();
    }
  });
});
