import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: EwBlockToolbar, collectLibraryVariants, nextVariants } = await import('../../../../../blocks/canvas/ew-block-toolbar/ew-block-toolbar.js');
const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');
const { setCommentsController } = await import('../../../../../blocks/canvas/editor-utils/comments-bridge.js');

describe('collectLibraryVariants', () => {
  const items = [
    { identities: [{ name: 'cards', variants: ['dark', 'wide'] }] },
    { identities: [{ name: 'Cards', variants: ['Dark', 'Horizontal'] }] },
    { identities: [{ name: 'cards', variants: [] }, { name: 'button', variants: ['primary'] }] },
    { identities: [] },
    {},
  ];

  it('collects variants from every identity matching the block, first spelling wins', () => {
    expect(collectLibraryVariants(items, 'cards')).to.deep.equal(['dark', 'wide', 'Horizontal']);
  });

  it('matches block names ignoring case and separators', () => {
    const list = [{ identities: [{ name: 'card-list', variants: ['two-up'] }] }];
    expect(collectLibraryVariants(list, 'Card List')).to.deep.equal(['two-up']);
  });

  it('ignores identities of other blocks', () => {
    expect(collectLibraryVariants(items, 'button')).to.deep.equal(['primary']);
    expect(collectLibraryVariants(items, 'hero')).to.deep.equal([]);
  });
});

describe('nextVariants', () => {
  it('appends a toggled-on variant', () => {
    expect(nextVariants('dark', { value: 'wide', values: ['dark', 'wide'], selected: true }))
      .to.equal('dark, wide');
  });

  it('adds the first variant to a block without one', () => {
    expect(nextVariants('', { value: 'dark', values: ['dark'], selected: true })).to.equal('dark');
  });

  it('removes a toggled-off variant matching loosely and keeps the rest as written', () => {
    expect(nextVariants('Two Up, dark', { value: 'two-up', values: ['dark'], selected: false }))
      .to.equal('dark');
  });

  it('clears all variants for the Clear all action', () => {
    expect(nextVariants('dark, wide', { value: '' })).to.equal('');
  });
});

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

  function picker() {
    return toolbar.shadowRoot.querySelector('nx-picker');
  }

  it('shows no variant picker when the block has no variants', async () => {
    toolbar.show('cards');
    await toolbar.updateComplete;

    expect(picker()).to.be.null;
  });

  it('renders a multi-select picker with one toggle per library variant', async () => {
    toolbar.show('cards');
    toolbar._variantOptions = ['highlight', 'blue'];
    await toolbar.updateComplete;

    expect(picker()).to.exist;
    expect(picker().multiple).to.be.true;
    const options = picker().items.filter((i) => i.label && !i.action).map((i) => i.value);
    expect(options).to.deep.equal(['highlight', 'blue']);
    expect(picker().values).to.deep.equal([]);
  });

  it('offers Clear all only when the block has variants', async () => {
    toolbar.show('cards');
    toolbar._variantOptions = ['highlight'];
    await toolbar.updateComplete;
    expect(picker().items.some((i) => i.action)).to.be.false;

    toolbar.show('cards', 'highlight');
    await toolbar.updateComplete;
    const clear = picker().items.find((i) => i.action);
    expect(clear).to.include({ label: 'Clear all', value: '' });
  });

  it('checks every current variant, mapped to the library spelling', async () => {
    toolbar.show('cards', 'wide, two up');
    toolbar._variantOptions = ['Wide', 'Two-Up', 'blue'];
    await toolbar.updateComplete;

    expect(picker().values).to.deep.equal(['Wide', 'Two-Up']);
  });

  it('lists current variants missing from the library as checked toggles', async () => {
    toolbar.show('cards', 'custom');
    toolbar._variantOptions = ['blue'];
    await toolbar.updateComplete;

    const options = picker().items.filter((i) => i.label && !i.action).map((i) => i.value);
    expect(options).to.deep.equal(['blue', 'custom']);
    expect(picker().values).to.deep.equal(['custom']);
  });

  it('shows the picker for a block whose only variants are not in the library', async () => {
    toolbar.show('cards', 'custom');
    await toolbar.updateComplete;

    expect(picker()).to.exist;
  });

  it('keeps the variant options when re-shown for the same open block', async () => {
    toolbar.show('cards');
    toolbar._variantOptions = ['highlight', 'blue'];
    await toolbar.updateComplete;

    toolbar.show('cards', 'highlight');
    await toolbar.updateComplete;

    expect(toolbar._variantOptions).to.deep.equal(['highlight', 'blue']);
    expect(picker().values).to.deep.equal(['highlight']);
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
