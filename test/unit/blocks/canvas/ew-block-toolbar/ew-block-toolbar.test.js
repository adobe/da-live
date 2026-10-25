import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { NodeSelection } = await import('da-y-wrapper');
const { setDaConfigs } = await import('../../../../fixtures/nx/utils/daConfig.js');
const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { resetBlockLibraryCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
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

  it('always offers Clear all so the menu keeps the same height', async () => {
    toolbar.show('cards');
    toolbar._variantOptions = ['highlight'];
    await toolbar.updateComplete;
    expect(picker().items.find((i) => i.action)).to.include({ label: 'Clear all', value: '' });

    toolbar.show('cards', 'highlight');
    await toolbar.updateComplete;
    expect(picker().items.find((i) => i.action)).to.include({ label: 'Clear all', value: '' });
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

  describe('re-show', () => {
    let loads;

    beforeEach(() => {
      loads = [];
      toolbar._loadVariants = (name) => loads.push(`variants:${name}`);
      toolbar._loadMultiBlock = (name) => loads.push(`multi:${name}`);
    });

    it('does not reload for the same open block', () => {
      toolbar.show('cards');
      toolbar.show('cards', 'dark');
      expect(loads).to.deep.equal(['variants:cards', 'multi:cards']);
    });

    it('reloads after the toolbar was hidden', () => {
      toolbar.show('cards');
      toolbar.hide();
      toolbar.show('cards');
      expect(loads).to.deep.equal(['variants:cards', 'multi:cards', 'variants:cards', 'multi:cards']);
    });

    it('reloads for a different block', () => {
      toolbar.show('cards');
      toolbar.show('hero');
      expect(loads).to.deep.equal(['variants:cards', 'multi:cards', 'variants:hero', 'multi:hero']);
    });
  });

  describe('variant toggles', () => {
    let editor;
    let focusCalls;
    let variantAtDispatch;

    beforeEach(async () => {
      editor = await createTestEditor();
      const { state } = editor.view;
      const { schema } = state;
      const cell = schema.nodes.table_cell.create(null, schema.nodes.paragraph.create(null, schema.text('cards (dark)')));
      const table = schema.nodes.table.create(null, schema.nodes.table_row.create(null, cell));
      editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, table));
      let tablePos = -1;
      editor.view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'table' && tablePos < 0) tablePos = pos;
      });
      editor.view.dispatch(editor.view.state.tr.setSelection(
        NodeSelection.create(editor.view.state.doc, tablePos),
      ));

      focusCalls = 0;
      editor.view.focus = () => { focusCalls += 1; };
      const dispatch = editor.view.dispatch.bind(editor.view);
      editor.view.dispatch = (tr) => {
        variantAtDispatch = toolbar.blockVariant;
        dispatch(tr);
      };

      toolbar.view = editor.view;
      toolbar.show('cards', 'dark');
      toolbar._variantOptions = ['dark', 'wide'];
      await toolbar.updateComplete;
    });

    afterEach(() => destroyEditor(editor));

    function header() {
      return editor.view.state.selection.node.firstChild.firstChild.textContent;
    }

    function change(detail) {
      picker().dispatchEvent(new CustomEvent('change', { detail }));
    }

    it('appends a toggled-on variant to the header without moving focus', () => {
      change({ value: 'wide', values: ['dark', 'wide'], selected: true });
      expect(header()).to.equal('cards (dark, wide)');
      expect(toolbar.blockVariant).to.equal('dark, wide');
      expect(focusCalls).to.equal(0);
    });

    it('removes a toggled-off variant from the header', () => {
      change({ value: 'dark', values: [], selected: false });
      expect(header()).to.equal('cards');
      expect(toolbar.blockVariant).to.equal('');
    });

    it('updates the current variant before dispatching so the controller skips a re-show', () => {
      change({ value: 'wide', values: ['dark', 'wide'], selected: true });
      expect(variantAtDispatch).to.equal('dark, wide');
    });

    it('clears every variant and refocuses the editor for Clear all', () => {
      change({ value: 'wide', values: ['dark', 'wide'], selected: true });
      change({ value: '' });
      expect(header()).to.equal('cards');
      expect(focusCalls).to.equal(1);
    });

    it('does nothing for Clear all when the block has no variants', () => {
      change({ value: 'dark', values: [], selected: false });
      const { doc } = editor.view.state;
      focusCalls = 0;
      change({ value: '' });
      expect(editor.view.state.doc === doc).to.be.true;
      expect(focusCalls).to.equal(0);
    });
  });

  describe('library variants', () => {
    let savedFetch;

    beforeEach(() => {
      savedFetch = window.fetch;
      resetBlockLibraryCache();
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] }, data: [] }]);
      const pages = {
        '/blocks.json': JSON.stringify({ data: [{ name: 'Cards', path: '/cards' }, { name: 'Promo', path: '/promo' }] }),
        '/cards': `<body><div>
          <h2>Fancy Cards</h2>
          <div class="cards dark wide"><div><div>c</div></div></div>
          <h2>Cards (Horizontal)</h2>
          <div class="cards"><div><div>c</div></div></div>
          <div class="hero big"><div><div>h</div></div></div>
        </div></body>`,
        '/promo': `<body><div>
          <div class="library-container-start"></div>
          <h2>Promo heading</h2>
          <div class="cards Dark promo"><div><div>c</div></div></div>
          <div class="library-metadata"><div><div>name</div><div>Promo bundle</div></div></div>
          <div class="library-container-end"></div>
        </div></body>`,
      };
      window.fetch = (url) => {
        const pathname = new URL(url, window.location.href).pathname.replace(/\.plain\.html$/, '');
        const key = Object.keys(pages).find((p) => pathname.endsWith(p));
        return Promise.resolve(key ? new Response(pages[key]) : new Response('', { status: 404 }));
      };
    });

    afterEach(() => {
      window.fetch = savedFetch;
      setDaConfigs([]);
      resetBlockLibraryCache();
    });

    it('collects class, legacy-label and group variants for the selected block', async () => {
      toolbar.org = 'tborg';
      toolbar.site = 'tbsite';
      toolbar._blockName = 'cards';
      await toolbar._loadVariants('cards');
      expect(toolbar._variantOptions).to.deep.equal(['dark', 'wide', 'Horizontal', 'promo']);
    });
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

describe('ew-block-toolbar with the toolbar controller', () => {
  let editor;
  let frame;
  let btb;
  let toolbarController;
  let selectionToolbar;

  before(async () => {
    ({ toolbarController } = await import('../../../../../blocks/canvas/editor-utils/toolbar-controller.js'));
    selectionToolbar = await import('../../../../../blocks/canvas/editor-utils/selection-toolbar.js');
    await import('../../../../../blocks/canvas/ew-selection-toolbar/ew-selection-toolbar.js');
  });

  beforeEach(async () => {
    frame = sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => {
      cb();
      return 0;
    });
    toolbarController.reset();
    canvasBus.blockEditState.emit({ open: false });
    const plugin = selectionToolbar.createSelectionToolbarPlugin();
    editor = await createTestEditor({ additionalPlugins: [plugin] });
    const { state } = editor.view;
    const { schema } = state;
    const cell = schema.nodes.table_cell.create(null, schema.nodes.paragraph.create(null, schema.text('cards (dark)')));
    const table = schema.nodes.table.create(null, schema.nodes.table_row.create(null, cell));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, table));
    toolbarController.setDocView(editor.view);
    btb = toolbarController.ensureBlockToolbar();
  });

  afterEach(() => {
    destroyEditor(editor);
    toolbarController.reset();
    frame.restore();
  });

  function tablePos() {
    let found = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'table' && found < 0) found = pos;
    });
    return found;
  }

  function selectFromDoc() {
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'doc', active: true });
    const { state } = editor.view;
    editor.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, tablePos())));
  }

  function selectFromIframe() {
    const { state } = editor.view;
    editor.view.dispatch(state.tr
      .setSelection(NodeSelection.create(state.doc, tablePos()))
      .setMeta(selectionToolbar.NX_QUICK_EDIT_IFRAME_SELECTION_META, true));
    const block = selectionToolbar.selectedBlockDescriptor(editor.view.state);
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: false, block });
  }

  async function toggleOn(value) {
    btb._variantOptions = ['dark', 'wide', 'blue'];
    await btb.updateComplete;
    const picker = btb.shadowRoot.querySelector('nx-picker');
    const values = [...picker.values, value];
    picker.dispatchEvent(new CustomEvent('change', { detail: { value, values, selected: true } }));
    await btb.updateComplete;
  }

  function header() {
    return editor.view.state.doc.nodeAt(tablePos()).firstChild.firstChild.textContent;
  }

  it('keeps successive toggles in layout mode (wysiwyg surface)', async () => {
    canvasBus.editorViewState.emit({ view: 'layout' });
    selectFromIframe();
    expect(btb.blockVariant).to.equal('dark');

    await toggleOn('wide');
    await toggleOn('blue');

    expect(header()).to.equal('cards (dark, wide, blue)');
    expect(btb.blockVariant).to.equal('dark, wide, blue');
    expect(toolbarController.activeSurface).to.equal('wysiwyg');
  });

  it('keeps successive toggles in split view with the block selected in the iframe', async () => {
    canvasBus.editorViewState.emit({ view: 'split' });
    selectFromIframe();

    await toggleOn('wide');
    await toggleOn('blue');

    expect(header()).to.equal('cards (dark, wide, blue)');
    expect(btb.blockVariant).to.equal('dark, wide, blue');
  });

  it('does not claim the wysiwyg surface when toggling from the doc pane in split view', async () => {
    canvasBus.editorViewState.emit({ view: 'split' });
    selectFromDoc();
    expect(toolbarController.activeSurface).to.equal('doc');

    await toggleOn('wide');
    await toggleOn('blue');

    expect(header()).to.equal('cards (dark, wide, blue)');
    expect(btb.blockVariant).to.equal('dark, wide, blue');
    expect(toolbarController.activeSurface).to.equal('doc');
  });

  describe('closing the open picker', () => {
    let closes;

    async function openPicker() {
      btb._variantOptions = ['dark', 'wide', 'blue'];
      await btb.updateComplete;
      const picker = btb.shadowRoot.querySelector('nx-picker');
      closes = 0;
      picker.open = true;
      picker.close = () => {
        closes += 1;
        picker.open = false;
      };
    }

    function addSecondCards() {
      const { state } = editor.view;
      const { schema } = state;
      const cell = schema.nodes.table_cell.create(null, schema.nodes.paragraph.create(null, schema.text('cards (dark)')));
      const table = schema.nodes.table.create(null, schema.nodes.table_row.create(null, cell));
      editor.view.dispatch(state.tr.insert(state.doc.content.size, table));
      let last = -1;
      editor.view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'table') last = pos;
      });
      return last;
    }

    beforeEach(() => {
      canvasBus.editorViewState.emit({ view: 'layout' });
    });

    it('stays open while toggling variants', async () => {
      selectFromIframe();
      await openPicker();
      await toggleOn('wide');
      expect(closes).to.equal(0);
    });

    it('closes when the user clicks to a caret in the iframe', async () => {
      selectFromIframe();
      await openPicker();
      canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true });
      expect(closes).to.equal(1);
    });

    it('closes when the user selects another block with the same name and variant', async () => {
      const second = addSecondCards();
      selectFromIframe();
      await openPicker();
      const { state } = editor.view;
      editor.view.dispatch(state.tr
        .setSelection(NodeSelection.create(state.doc, second))
        .setMeta(selectionToolbar.NX_QUICK_EDIT_IFRAME_SELECTION_META, true));
      const block = selectionToolbar.selectedBlockDescriptor(editor.view.state);
      canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: false, block });
      expect(closes).to.equal(1);
    });

    it('ignores doc-surface updates such as collaborator edits', async () => {
      selectFromIframe();
      await openPicker();
      canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true, block: null });
      expect(closes).to.equal(0);
    });
  });
});
