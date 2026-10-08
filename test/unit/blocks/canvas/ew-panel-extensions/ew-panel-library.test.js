import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { getExtensionsBridge } from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';
import { makeView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-panel-extensions/ew-panel-library.js');

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
    expect(images).to.deep.equal(['https://main--site--org.aem.live/templates/media.png']);
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
      publicDocument: 'https://feat--site--org.aem.live/templates/home',
      rootMedia: true,
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
      publicDocument: 'https://main--site--org.aem.page/templates/home',
      rootMedia: true,
      credentials: 'include',
    },
    {
      name: 'cross-org DA-content templates',
      source: 'https://content.da.live/other/shared/templates/home',
      publicDocument: 'https://content.da.live/other/shared/templates/home',
    },
    {
      name: 'DA-content templates without editor org context',
      source: 'https://content.da.live/org/site/templates/home',
      publicDocument: 'https://content.da.live/org/site/templates/home',
      context: {},
    },
    {
      name: 'relative same-org template sources',
      source: '/templates/home',
      fetched: 'https://main--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://main--site--org.aem.live/templates/home',
      rootMedia: true,
      credentials: 'include',
    },
    {
      name: 'already-proxied templates',
      source: 'https://main--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://main--site--org.aem.page/templates/home',
      rootMedia: true,
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
      publicDocument: 'https://feat--shared--other.aem.page/templates/home',
      rootMedia: true,
    },
    {
      name: 'already-proxied templates without editor org context',
      source: 'https://main--site--org.stage-preview.da.live/templates/home',
      publicDocument: 'https://main--site--org.aem.page/templates/home',
      rootMedia: true,
      context: {},
    },
  ].forEach(({
    name, source, fetched, publicDocument, rootMedia, credentials, context,
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
        const base = index === 1 && rootMedia ? `${new URL(publicDocument).origin}/` : publicDocument;
        return new URL(path, base).href;
      });
      expect(images.map((img) => img.src)).to.deep.equal(expected);
      expect(images.every((img) => img.alt === 'Template image')).to.be.true;
      expect(images.some((img) => img.src.includes('preview.da.live'))).to.be.false;
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
