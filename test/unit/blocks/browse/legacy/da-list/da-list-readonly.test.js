/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../../blocks/browse/legacy/da-list/da-list.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const cap = (view, canOpen = true) => ({
  canOpen, canWrite: false, collaboration: false, branching: false, readOnly: true, view,
});

describe('legacy da-list imported wiring', () => {
  let el;
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response('[]', { status: 200 }));
  });
  afterEach(() => {
    window.fetch = savedFetch;
    el?.remove();
  });

  it('renders no link for pages, keeps folder/image/sheet links, and no select or drop', async () => {
    el = document.createElement('da-list');
    Object.assign(el, {
      select: true,
      drag: true,
      editor: '/edit#',
      listItems: [
        { path: '/demo/wknd/page.html', name: 'page', ext: 'html', capabilities: cap('none', false) },
        {
          path: '/demo/wknd/hero.png', name: 'hero', ext: 'png', displayName: 'Hero Source.png', contentProfile: 'aem-import', capabilities: cap('media'),
        },
        { path: '/demo/wknd/data.json', name: 'data', ext: 'json', capabilities: cap('sheet-readonly') },
        { path: '/demo/wknd/images', name: 'images', displayName: 'Images', contentProfile: 'aem-import', capabilities: cap('browse') },
        { path: '/demo/wknd/native.png', name: 'native', ext: 'png', displayName: 'native.png', contentProfile: 'native-da' },
      ],
    });
    el._readOnlyContent = true;
    document.body.appendChild(el);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && el.shadowRoot.querySelectorAll('da-list-item').length < 5) {
      // eslint-disable-next-line no-await-in-loop
      await nextFrame();
    }
    await nextFrame();
    const row = (filename) => [...el.shadowRoot.querySelectorAll('da-list-item')].find((item) => item.path === `/demo/wknd/${filename}`);
    const link = (name) => row(name).shadowRoot.querySelector('a.da-item-list-item-title');
    expect(link('page.html')).to.equal(null);
    expect(row('page.html').shadowRoot.querySelector('span.da-item-list-item-title[aria-disabled="true"]')).to.exist;
    expect(link('images').getAttribute('href')).to.equal('#/demo/wknd/images');
    expect(link('hero.png').getAttribute('href')).to.contain('/media#/demo/wknd/hero.png');
    expect(link('data.json').getAttribute('href')).to.contain('/sheet#/demo/wknd/data');
    const label = (filename) => link(filename).querySelector('.da-item-list-item-name-text').textContent;
    expect(label('images')).to.equal('Images');
    expect(label('hero.png')).to.equal('Hero Source.png');
    expect(label('native.png')).to.equal('native');
    expect(el.shadowRoot.querySelector('input[type="checkbox"]')).to.equal(null);
    expect(el.shadowRoot.querySelector('.da-drop-area')).to.equal(null);
    expect(row('hero.png').allowselect).not.to.equal(true);
  });
});
