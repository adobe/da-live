import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { getExtensionsBridge } from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';

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
