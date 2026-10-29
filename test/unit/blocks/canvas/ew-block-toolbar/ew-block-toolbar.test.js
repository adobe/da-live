import { expect } from '@esm-bundle/chai';
import { EditorState, NodeSelection, Y, prosemirrorToYDoc, ySyncPlugin } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx, getNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import { setDaConfigs } from '../../../../fixtures/nx/utils/daConfig.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: EwBlockToolbar, splitLibraryVariant } = await import('../../../../../blocks/canvas/ew-block-toolbar/ew-block-toolbar.js');
const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');
const { setCommentsController } = await import('../../../../../blocks/canvas/editor-utils/comments-bridge.js');

describe('splitLibraryVariant', () => {
  it('prefers a "Name (variant)" name over class-derived variants (library-metadata override)', () => {
    expect(splitLibraryVariant({ name: 'Cards (promo)', variants: 'promo' }))
      .to.deep.equal({ base: 'Cards', variant: 'promo' });
  });

  it('parses a "Name (variant)" heading name', () => {
    expect(splitLibraryVariant({ name: 'Cards (Horizontal)' }))
      .to.deep.equal({ base: 'Cards', variant: 'Horizontal' });
  });

  it('falls back to class-derived variants when the name has no parentheses', () => {
    expect(splitLibraryVariant({ name: 'cards', variants: 'promo' }))
      .to.deep.equal({ base: 'cards', variant: 'promo' });
  });

  it('returns no variant for a plain name', () => {
    expect(splitLibraryVariant({ name: 'Cards' })).to.deep.equal({ base: 'Cards', variant: '' });
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

  describe('replace block', () => {
    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const table = (name, body) => ({
      type: 'table',
      content: [name, body].map((text) => ({
        type: 'table_row',
        content: [{ type: 'table_cell', content: [paragraph(text)] }],
      })),
    });
    let view;
    let ydoc;
    let savedFetch;
    let hashChange;
    let resetBlockLibraryCache;

    beforeEach(async () => {
      ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
      ({ resetBlockLibraryCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js'));
      savedFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (url.startsWith('/') || url.startsWith(window.location.origin)) return savedFetch(url, opts);
        return new Response('[]');
      };
      hashChange._set({ org: 'org', site: 'site' });
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] } }]);
      resetBlockLibraryCache();

      view = makeRealView({
        type: 'doc',
        content: [paragraph('Intro'), table('cards', 'Original'), paragraph('Outro'), table('other', 'Keep')],
      });
      const { schema, doc } = view.state;
      ydoc = prosemirrorToYDoc(doc);
      view.updateState(EditorState.create({
        schema,
        plugins: [ySyncPlugin(ydoc.getXmlFragment('prosemirror'))],
      }));
      const pos = view.state.doc.firstChild.nodeSize;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      toolbar.view = view;
      toolbar._hasBlockLibrary = true;
    });

    afterEach(() => {
      document.querySelector('ew-block-library-modal')?.remove();
      window.fetch = savedFetch;
      setDaConfigs([]);
      hashChange._set({});
      resetBlockLibraryCache();
      const mount = view.dom.parentElement;
      view.destroy();
      mount.remove();
      ydoc.destroy();
    });

    const contents = () => {
      const result = [];
      view.state.doc.forEach((node) => result.push([node.type.name, node.textContent]));
      return result;
    };

    function libraryTable() {
      const dom = document.createElement('table');
      dom.innerHTML = '<tbody><tr><td><p>hero</p></td></tr><tr><td><p>New</p></td></tr></tbody>';
      return dom;
    }

    async function openModal() {
      await toolbar._onReplaceBlock();
      for (let i = 0; i < 50 && !document.querySelector('ew-block-library-modal'); i += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 10); });
      }
      const modal = document.querySelector('ew-block-library-modal');
      expect(modal).to.exist;
      return modal;
    }

    function remoteEdit(fn) {
      const fragment = ydoc.getXmlFragment('prosemirror');
      ydoc.transact(() => fn(fragment), 'remote');
    }

    function remoteParagraph(text) {
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText(text)]);
      return p;
    }

    it('replaces the selected block and keeps it selected', async () => {
      const modal = await openModal();
      modal.onInsert(libraryTable());
      expect(contents()).to.deep.equal([
        ['paragraph', 'Intro'], ['table', 'heroNew'], ['paragraph', 'Outro'], ['table', 'otherKeep'],
      ]);
      const { selection } = view.state;
      expect(selection instanceof NodeSelection).to.equal(true);
      expect(selection.node?.textContent).to.equal('heroNew');
    });

    it('replaces the right block after a collaborator edits above it', async () => {
      const modal = await openModal();
      remoteEdit((fragment) => fragment.insert(0, [remoteParagraph('Remote')]));
      modal.onInsert(libraryTable());
      expect(contents()).to.deep.equal([
        ['paragraph', 'Remote'], ['paragraph', 'Intro'], ['table', 'heroNew'],
        ['paragraph', 'Outro'], ['table', 'otherKeep'],
      ]);
    });

    it('replaces the right block when it is first and a collaborator inserts above it', async () => {
      view.dispatch(view.state.tr.delete(0, view.state.doc.firstChild.nodeSize));
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
      const modal = await openModal();
      remoteEdit((fragment) => fragment.insert(0, [remoteParagraph('Remote')]));
      modal.onInsert(libraryTable());
      expect(contents()).to.deep.equal([
        ['paragraph', 'Remote'], ['table', 'heroNew'], ['paragraph', 'Outro'], ['table', 'otherKeep'],
      ]);
    });

    it('leaves the doc alone when a collaborator deleted the block', async () => {
      const modal = await openModal();
      remoteEdit((fragment) => fragment.delete(1, 1));
      const before = contents();
      modal.onInsert(libraryTable());
      expect(contents()).to.deep.equal(before);
      expect(before).to.deep.equal([
        ['paragraph', 'Intro'], ['paragraph', 'Outro'], ['table', 'otherKeep'],
      ]);
    });
  });
});

describe('ew-block-toolbar delete confirmation', () => {
  let toolbar;
  let view;

  function makeBlockView() {
    const schema = getSchema();
    const cell = (text) => schema.nodes.table_cell.create(
      null,
      schema.nodes.paragraph.create(null, schema.text(text)),
    );
    const table = schema.nodes.table.create(null, [
      schema.nodes.table_row.create(null, [cell('cards (promo)')]),
      schema.nodes.table_row.create(null, [cell('body')]),
    ]);
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text('Keep me')),
      table,
    ]);
    const tablePos = doc.firstChild.nodeSize;
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, tablePos) });
    const fake = {
      state,
      dispatch(tr) { fake.state = fake.state.apply(tr); },
      focus() {},
    };
    return fake;
  }

  const dialog = () => toolbar.shadowRoot.querySelector('da-confirm-dialog');
  const blockTypes = () => {
    const types = [];
    view.state.doc.forEach((node) => types.push(node.type.name));
    return types;
  };

  beforeEach(async () => {
    toolbar = document.createElement('ew-block-toolbar');
    document.body.append(toolbar);
    view = makeBlockView();
    toolbar.view = view;
    toolbar.show('cards', 'promo');
    await toolbar.updateComplete;
    await toolbar._onDeleteBlock();
    await toolbar.updateComplete;
  });

  afterEach(() => toolbar.remove());

  it('asks for confirmation instead of deleting immediately', () => {
    expect(dialog()).to.exist;
    expect(dialog().textContent).to.contain('cards (promo)');
    expect(blockTypes()).to.deep.equal(['paragraph', 'table']);
    expect(toolbar.isInteracting).to.be.true;
  });

  it('deletes the block when confirmed', async () => {
    dialog().action.click();
    await toolbar.updateComplete;

    expect(blockTypes()).to.deep.equal(['paragraph']);
    expect(dialog()).to.not.exist;
    expect(toolbar.open).to.be.false;
  });

  it('keeps the block when cancelled', async () => {
    dialog().shadowRoot.querySelector('nx-dialog').close();
    await toolbar.updateComplete;

    expect(blockTypes()).to.deep.equal(['paragraph', 'table']);
    expect(dialog()).to.not.exist;
    expect(toolbar.isInteracting).to.be.false;
  });
});
