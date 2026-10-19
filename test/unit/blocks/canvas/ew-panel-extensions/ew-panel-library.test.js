import { expect } from '@esm-bundle/chai';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx, getNx } from '../../../../../scripts/utils.js';
import { getExtensionsBridge } from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { makeRealView } from '../test-helpers.js';
import { setDaConfigs } from '../../../../fixtures/nx/utils/daConfig.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-panel-extensions/ew-panel-library.js');

describe('Ew panel library block insertion', () => {
  const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const table = (name, body) => ({
    type: 'table',
    content: [
      { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph(name)] }] },
      { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph(body)] }] },
    ],
  });
  let view;
  let el;
  let dom;
  let savedView;

  beforeEach(() => {
    savedView = getExtensionsBridge().view;
    view = makeRealView({
      type: 'doc',
      content: [
        paragraph('Intro'), table('Cards', 'Original'), paragraph('Outro'), table('Other', 'Keep'),
      ],
    });
    getExtensionsBridge().view = view;
    el = document.createElement('ew-panel-library');
    dom = document.createElement('table');
    dom.innerHTML = '<tbody><tr><td><p>New</p></td></tr><tr><td><p>Replacement</p></td></tr></tbody>';
  });

  afterEach(() => {
    getExtensionsBridge().view = savedView;
    const mount = view.dom.parentElement;
    view.destroy();
    mount.remove();
  });

  const contents = () => {
    const result = [];
    view.state.doc.forEach((node) => result.push([node.type.name, node.textContent]));
    return result;
  };
  const selectBody = () => {
    let caret;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Original') caret = pos + 1;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)));
  };

  it('replaces the enclosing block for a caret inside a block cell', () => {
    selectBody();
    el._insertBlock({ dom });
    expect(contents()).to.deep.equal([
      ['paragraph', 'Intro'], ['table', 'NewReplacement'],
      ['paragraph', 'Outro'], ['table', 'OtherKeep'],
    ]);
  });

  it('replaces an explicitly selected block without nesting a table', () => {
    const pos = view.state.doc.firstChild.nodeSize;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    el._insertBlock({ dom });
    expect(contents()).to.deep.equal([
      ['paragraph', 'Intro'], ['table', 'NewReplacement'],
      ['paragraph', 'Outro'], ['table', 'OtherKeep'],
    ]);
  });

  ['plugin', 'slash menu'].forEach((source) => {
    it(`replaces the enclosing block through the ${source} library modal`, async () => {
      const { extensionToPanelView, resetBlockLibraryCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
      const { hashChange } = await import(`${getNx()}/utils/utils.js`);
      const savedFetch = window.fetch;
      hashChange._set({ org: 'org', site: 'site' });
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] } }]);
      resetBlockLibraryCache();
      window.fetch = async (url, options) => (url === 'https://main--site--org.aem.live/blocks.json'
        ? new Response('[]', { status: 200 })
        : savedFetch(url, options));
      try {
        selectBody();
        if (source === 'plugin') {
          await extensionToPanelView({ name: 'blocks', ootb: true }, 'Library').openModal();
        } else {
          const { COMMAND_BY_ID } = await import('../../../../../blocks/canvas/editor-utils/command-defs.js');
          await COMMAND_BY_ID.get('open-library').apply(view);
        }
        for (let attempt = 0; attempt < 50 && !document.querySelector('ew-block-library-modal'); attempt += 1) {
          await new Promise((resolve) => { setTimeout(resolve, 10); });
        }
        const modal = document.querySelector('ew-block-library-modal');
        expect(modal).to.exist;
        modal.onInsert(dom);
        expect(contents()).to.deep.equal([
          ['paragraph', 'Intro'], ['table', 'NewReplacement'],
          ['paragraph', 'Outro'], ['table', 'OtherKeep'],
        ]);
      } finally {
        document.querySelector('ew-block-library-modal')?.remove();
        window.fetch = savedFetch;
        setDaConfigs([]);
        hashChange._set({});
        resetBlockLibraryCache();
      }
    });
  });

  it('replaces the enclosing block through a slash-library entry', async () => {
    const { ingestBlocks, insertBlockItem, resetBlockLibrary } = await import('../../../../../blocks/canvas/editor-utils/block-slash.js');
    try {
      await ingestBlocks([{
        name: 'New',
        path: '/new',
        loadVariants: Promise.resolve([{ name: 'New', dom }]),
      }]);
      selectBody();
      await insertBlockItem(view, 'block:0');
      expect(contents()).to.deep.equal([
        ['paragraph', 'Intro'], ['table', 'NewReplacement'],
        ['paragraph', 'Outro'], ['table', 'OtherKeep'],
      ]);
    } finally {
      resetBlockLibrary();
    }
  });

  it('inserts outside a block without replacing the current paragraph', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    el._insertBlock({ dom });
    expect(contents().filter(([type]) => type === 'table')).to.deep.equal([
      ['table', 'NewReplacement'], ['table', 'CardsOriginal'], ['table', 'OtherKeep'],
    ]);
    expect(view.state.doc.textContent.replace('NewReplacement', '')).to.include('Intro');
  });

  it('keeps insertion for selections spanning more than one target', () => {
    selectBody();
    const { from } = view.state.selection;
    const end = view.state.doc.firstChild.nodeSize + view.state.doc.child(1).nodeSize;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, end + 2)));
    el._insertBlock({ dom });
    expect(view.state.doc.textContent).to.include('Replacement');
    expect(view.state.doc.lastChild.textContent).to.equal('OtherKeep');
  });

  it('keeps insertion for library groups with multiple content nodes', () => {
    selectBody();
    const group = document.createElement('div');
    group.append(dom, document.createElement('p'));
    group.lastChild.textContent = 'Grouped text';
    el._insertBlock({ dom: group });
    expect(view.state.doc.textContent).to.include('Replacement');
    expect(view.state.doc.textContent).to.include('Grouped text');
  });
});

describe('Ew panel library _insertTemplate', () => {
  let savedFetch;
  let savedExtensionsBridge;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedExtensionsBridge = getExtensionsBridge().view;
  });

  afterEach(() => {
    window.fetch = savedFetch;
    getExtensionsBridge().view = savedExtensionsBridge;
  });

  it('should not fetch when there is no editor view', async () => {
    getExtensionsBridge().view = null;
    let fetched = false;
    window.fetch = () => {
      fetched = true;
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const el = document.createElement('ew-panel-library');
    await el._insertTemplate({ key: 'home', value: 'https://content.da.live/org/site/home' });

    expect(fetched).to.be.false;
  });

  it('should fetch item.value when an editor view is present', async () => {
    getExtensionsBridge().view = {};
    let fetchedUrl;
    window.fetch = (url) => {
      fetchedUrl = url;
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const el = document.createElement('ew-panel-library');
    await el._insertTemplate({ key: 'home', value: 'https://content.da.live/org/site/home' });

    expect(fetchedUrl).to.equal('https://content.da.live/org/site/home');
  });
});

describe('Ew panel library icons: preview + search', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('ew-panel-library');
    document.body.append(el);
    el.extension = { name: 'icons', ootb: true, sources: [] };
    await el.updateComplete;
    await el._loadItems();
    el._items = [
      { key: 'search', icon: 'https://content.da.live/adobe/da-live/icons/search.svg', text: ':search:' },
      {
        key: 'financial-services',
        icon: 'https://content.da.live/adobe/da-live/icons/financial-services.svg',
        text: ':financial-services:',
      },
    ];
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('shows branch-unavailable feedback without loading a guessed preview iframe', async () => {
    el._hashState = { org: 'org', site: 'site', path: 'page' };
    canvasBus.branchState.emit({ org: 'org', site: 'site', path: '/org/site/page', status: 'pending' });
    await el._openPreview({ name: 'Hero', path: 'https://content.da.live/org/site/blocks/hero' });
    await el.updateComplete;
    expect(el.shadowRoot.textContent).to.include('Preview branch unavailable.');
    expect(el.shadowRoot.querySelector('iframe')).to.equal(null);
    canvasBus.branchState.emit({ path: null, status: 'pending' });
    await el.updateComplete;
    expect(el._preview).to.equal(undefined);
  });

  it('renders an icon preview image per item using the sheet-configured icon URL', () => {
    const imgs = el.shadowRoot.querySelectorAll('.ext-item-icon');
    expect(imgs.length).to.equal(2);
    expect(imgs[0].src).to.equal('https://content.da.live/adobe/da-live/icons/search.svg');
  });

  it('filters items by the search box', async () => {
    const input = el.shadowRoot.querySelector('.ext-search input');
    input.value = 'financial';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;

    const names = [...el.shadowRoot.querySelectorAll('.ext-item-name')].map((n) => n.textContent);
    expect(names).to.deep.equal(['financial-services']);
  });

  it('hides a broken icon image on load error', async () => {
    const img = el.shadowRoot.querySelector('.ext-item-icon');
    img.dispatchEvent(new Event('error'));
    await el.updateComplete;

    expect(img.style.display).to.equal('none');
  });
});
