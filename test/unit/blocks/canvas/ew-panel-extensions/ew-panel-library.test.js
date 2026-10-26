import { expect } from '@esm-bundle/chai';
import { stub } from 'sinon';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx, getNx } from '../../../../../scripts/utils.js';
import { getExtensionsBridge } from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';
import { makeView, makeRealView } from '../test-helpers.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
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
    it(`replaces the enclosing block through the ${source} modal using a protected library`, async () => {
      const { extensionToPanelView, resetBlockLibraryCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
      const { hashChange } = await import(`${getNx()}/utils/utils.js`);
      const savedFetch = window.fetch;
      const savedIMS = window.adobeIMS;
      // Other test pages share localStorage; keep this sign-in state local to this page.
      const storage = stub(Storage.prototype, 'getItem').callThrough();
      storage.withArgs('nx-ims').returns('true');
      window.adobeIMS = { getAccessToken: () => ({ token: 'test-token' }) };
      hashChange._set({ org: 'org', site: 'site' });
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] } }]);
      resetBlockLibraryCache();
      const proxy = 'https://main--site--org.stage-preview.da.live';
      const responses = new Map([
        [`${proxy}/gimme_cookie`, ''],
        [`${proxy}/blocks.json`, JSON.stringify([{ name: 'New', path: 'https://main--site--org.aem.live/blocks/new' }])],
        [`${proxy}/blocks/new.plain.html`, '<body><div><div class="New"><div><div><p>Replacement</p></div></div></div></div></body>'],
      ]);
      const calls = [];
      window.fetch = async (url, options) => {
        if (url.startsWith('/') || url.startsWith(window.location.origin)) {
          return savedFetch(url, options);
        }
        calls.push({ url, options });
        if (!responses.has(url)) throw new Error(`Unexpected library request: ${url}`);
        return new Response(responses.get(url));
      };
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
        expect(modal.blocks).to.have.lengthOf(1);
        const variants = await modal.blocks[0].loadVariants;
        expect(variants).to.have.lengthOf(1);
        modal.onInsert(variants[0].dom);
        expect(contents()).to.deep.equal([
          ['paragraph', 'Intro'], ['table', 'NewReplacement'],
          ['paragraph', 'Outro'], ['table', 'OtherKeep'],
        ]);
        expect(calls.map(({ url }) => url)).to.deep.equal([...responses.keys()]);
        expect(calls.every(({ options }) => options.credentials === 'include')).to.equal(true);
        expect(calls[0].options.headers.Authorization).to.equal('Bearer test-token');
      } finally {
        document.querySelector('ew-block-library-modal')?.remove();
        window.fetch = savedFetch;
        if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
        storage.restore();
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
    expect(el._actionError).to.equal('Unable to load template (404).');
  });

  it('inserts a same-org template through the proxy without persisting proxy image URLs', async () => {
    const view = makeView({ type: 'doc', content: [{ type: 'paragraph' }] });
    getExtensionsBridge().view = view;
    const calls = [];
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return new Response('<body><main><div><p>Template text</p><p><img src="./media.png" width="800" height="400"></p></div></main></body>');
    };
    const el = document.createElement('ew-panel-library');
    el._hashState = { org: 'org', site: 'site' };
    await el._insertTemplate({ path: 'https://main--site--org.aem.live/templates/home' });
    expect(calls[0].url).to.equal('https://main--site--org.stage-preview.da.live/templates/home');
    expect(calls[0].opts.credentials).to.equal('include');
    expect(view.state.doc.textContent).to.include('Template text');
    const images = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image') images.push(node.attrs.src);
    });
    expect(images).to.deep.equal(['https://content.da.live/org/site/templates/media.png']);
    expect(el._actionError).to.equal(undefined);
  });

  it('keeps a cross-org template direct and inserts its content', async () => {
    const view = makeView({ type: 'doc', content: [{ type: 'paragraph' }] });
    getExtensionsBridge().view = view;
    const calls = [];
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return new Response('<body><main><div><p>Shared template</p></div></main></body>');
    };
    const el = document.createElement('ew-panel-library');
    el._hashState = { org: 'org', site: 'site' };
    await el._insertTemplate({ path: 'https://main--shared--other.aem.live/templates/home' });
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].url).to.equal('https://main--shared--other.aem.live/templates/home');
    expect(calls[0].opts.credentials).to.equal(undefined);
    expect(view.state.doc.textContent).to.include('Shared template');
  });

  [
    {
      name: 'same-org AEM templates',
      source: 'https://feat--site--org.aem.live/templates/home',
      fetched: 'https://feat--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://content.da.live/org/site/templates/home',
      contentRoot: 'https://content.da.live/org/site',
      credentials: 'include',
    },
    {
      name: 'cross-org AEM templates',
      source: 'https://feat--shared--other.aem.page/templates/home',
      publicDocument: 'https://feat--shared--other.aem.page/templates/home',
      rootMedia: true,
    },
    {
      name: 'proxied DA-content templates',
      source: 'https://content.da.live/org/site/templates/home',
      fetched: 'https://main--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://content.da.live/org/site/templates/home',
      contentRoot: 'https://content.da.live/org/site',
      credentials: 'include',
    },
    {
      name: 'cross-org DA-content templates',
      source: 'https://content.da.live/other/shared/templates/home',
      publicDocument: 'https://content.da.live/other/shared/templates/home',
      contentRoot: 'https://content.da.live/other/shared',
    },
    {
      name: 'DA-content templates without editor org context',
      source: 'https://content.da.live/org/site/templates/home',
      publicDocument: 'https://content.da.live/org/site/templates/home',
      contentRoot: 'https://content.da.live/org/site',
      context: {},
    },
    {
      name: 'relative same-org template sources',
      source: '/templates/home',
      fetched: 'https://main--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://content.da.live/org/site/templates/home',
      contentRoot: 'https://content.da.live/org/site',
      credentials: 'include',
    },
    {
      name: 'already-proxied templates',
      source: 'https://main--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://content.da.live/org/site/templates/home',
      contentRoot: 'https://content.da.live/org/site',
      credentials: 'include',
    },
    {
      name: 'unrecognized public template hosts',
      source: 'https://example.com/library/templates/home',
      publicDocument: 'https://example.com/library/templates/home',
    },
    {
      name: 'cross-org already-proxied templates',
      source: 'https://feat--shared--other.preview.da.live/templates/home',
      publicDocument: 'https://content.da.live/other/shared/templates/home',
      contentRoot: 'https://content.da.live/other/shared',
    },
    {
      name: 'already-proxied templates without editor org context',
      source: 'https://main--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://content.da.live/org/site/templates/home',
      contentRoot: 'https://content.da.live/org/site',
      context: {},
    },
    {
      name: 'AEM HTML resources forwarded by the proxy',
      source: 'https://feat--site--org.aem.page/templates/home.html',
      fetched: 'https://feat--site--org.stage-preview.da.live/templates/home.html',
      publicDocument: 'https://feat--site--org.aem.page/templates/home.html',
      rootMedia: true,
      credentials: 'include',
    },
    {
      name: 'stage DA-content templates',
      source: 'https://stage-content.da.live/org/site/templates/home',
      fetched: 'https://main--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://stage-content.da.live/org/site/templates/home',
      contentRoot: 'https://stage-content.da.live/org/site',
      credentials: 'include',
    },
    ...['content.da.live', 'stage-content.da.live'].flatMap((host) => ['.html', '.plain.html'].map((suffix) => ({
      name: `proxied ${host} ${suffix} resources`,
      source: `https://${host}/org/site/templates/home${suffix}`,
      fetched: `https://main--site--org.stage-preview.da.live/templates/home${suffix}`,
      publicDocument: `https://main--site--org.aem.page/templates/home${suffix}`,
      rootMedia: true,
      credentials: 'include',
    }))),
    {
      name: 'unproxied cross-org DA-content HTML',
      source: 'https://content.da.live/other/shared/templates/home.html',
      publicDocument: 'https://content.da.live/other/shared/templates/home.html',
      contentRoot: 'https://content.da.live/other/shared',
    },
  ].forEach(({
    name, source, fetched, publicDocument, rootMedia, contentRoot, credentials, context,
  }) => {
    it(`preserves saved image paths and URL components for ${name}`, async () => {
      const view = makeView({ type: 'doc', content: [{ type: 'paragraph' }] });
      getExtensionsBridge().view = view;
      const paths = [
        './images/logo.png?size=2#logo',
        './media_abc123.png?width=800#hero',
        '../shared/banner.png',
        '/assets/logo.svg',
        'https://cdn.example.com/photo.png?size=3#photo',
      ];
      const calls = [];
      window.fetch = async (url, opts) => {
        calls.push({ url, opts });
        const images = paths.map((src) => `<p><img src="${src}" alt="Template image" width="800" height="400"></p>`).join('');
        return new Response(`<body><main><div>${images}</div></main></body>`);
      };
      const el = document.createElement('ew-panel-library');
      el._hashState = context || { org: 'org', site: 'site' };
      await el._insertTemplate({ path: source });
      expect(el._actionError).to.equal(undefined);
      expect(calls).to.have.lengthOf(1);
      expect(calls[0].url).to.equal(fetched || source);
      expect(calls[0].opts.credentials).to.equal(credentials);
      const images = [];
      view.state.doc.descendants((node) => {
        if (node.type.name === 'image') images.push(node.attrs);
      });
      const expected = paths.map((path, index) => {
        if (contentRoot && path.startsWith('/')) return `${contentRoot}${path}`;
        const base = index === 1 && rootMedia ? `${new URL(publicDocument).origin}/` : publicDocument;
        return new URL(path, base).href;
      });
      expect(images.map((img) => img.src)).to.deep.equal(expected);
      expect(images.every((img) => img.alt === 'Template image')).to.be.true;
      expect(images.some((img) => img.src.includes('preview.da.live'))).to.be.false;
    });
  });

  it('restores the stored content host for root-relative images in a proxied template', async () => {
    const view = makeView({ type: 'doc', content: [{ type: 'paragraph' }] });
    getExtensionsBridge().view = view;
    window.fetch = async () => new Response('<body><main><div><p><img src="/library/templates/.home/img.png?width=800#hero" data-da-img-host="stage-content.da.live"></p></div></main></body>');
    const el = document.createElement('ew-panel-library');
    el._hashState = { org: 'org', site: 'site' };
    await el._insertTemplate({ path: 'https://feat--site--org.preview.da.live/templates/home' });
    expect(el._actionError).to.equal(undefined);
    const images = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image') images.push(node.attrs.src);
    });
    expect(images).to.deep.equal(['https://stage-content.da.live/org/site/library/templates/.home/img.png?width=800#hero']);
  });

  ['content.da.live', 'stage-content.da.live'].forEach((host) => {
    it(`restores HTTPS and removes a local port when an image records ${host}`, async () => {
      const view = makeView({ type: 'doc', content: [{ type: 'paragraph' }] });
      getExtensionsBridge().view = view;
      window.fetch = async () => new Response(`<body><main><div><p><img src="/library/.hero/img.png?width=800#hero" data-da-img-host="${host}"></p><p><img src="./images/logo.png" data-da-img-host="${host}"></p></div></main></body>`);
      const el = document.createElement('ew-panel-library');
      el._hashState = { org: 'org', site: 'site' };
      // Exercise the same HTTP/port base used by CON_ORIGIN in local development.
      await el._insertTemplate({ path: 'http://content.da.live:8788/org/site/templates/home' });
      expect(el._actionError).to.equal(undefined);
      const images = [];
      view.state.doc.descendants((node) => {
        if (node.type.name === 'image') images.push(node.attrs.src);
      });
      expect(images).to.deep.equal([
        `https://${host}/org/site/library/.hero/img.png?width=800#hero`,
        `https://${host}/org/site/templates/images/logo.png`,
      ]);
    });
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

describe('Ew panel library access errors', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('ew-panel-library');
    document.body.append(el);
    el.extension = { name: 'icons', ootb: true, sources: [] };
    await el.updateComplete;
    await el._loadItems();
  });

  afterEach(() => el.remove());

  it('explains how to get access when the library refused the request', async () => {
    const items = [];
    items.authError = true;
    el._items = items;
    await el.updateComplete;
    const state = el.shadowRoot.querySelector('.ext-state').textContent;
    expect(state).to.include('signed in to DA');
    expect(state).to.include('sign in with AEM Sidekick');
  });

  it('keeps the plain empty state otherwise', async () => {
    el._items = [];
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ext-state').textContent).to.equal('No icons found.');
  });

  it('renders an insertion error instead of silently failing', async () => {
    el._actionError = 'Library access was denied.';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('Library access was denied.');
  });

  it('renders access guidance when variant HTML is denied', async () => {
    const variants = [];
    variants.authError = true;
    el.extension = { name: 'blocks', ootb: true, sources: [] };
    await el.updateComplete;
    await el._loadItems();
    el._items = [{ name: 'Hero', path: '/hero' }];
    el._expandedBlock = '/hero';
    el._blockVariants.set('/hero', variants);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ext-variants-loading').textContent).to.include('Library access was denied');
  });
});
