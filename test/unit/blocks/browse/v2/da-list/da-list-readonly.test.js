/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { spy } from 'sinon';

const { setNx } = await import('../../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../../blocks/browse/v2/da-list/da-list.js');

const cap = (view, canOpen = true) => ({
  canOpen, canWrite: false, collaboration: false, branching: false, readOnly: true, view,
});
const ITEMS = [
  { path: '/demo/wknd/page.html', name: 'page', ext: 'html', capabilities: cap('none', false) },
  {
    path: '/demo/wknd/hero.png', name: 'hero', ext: 'png', displayName: 'Hero Source.png', contentProfile: 'aem-import', capabilities: cap('media'),
  },
  { path: '/demo/wknd/data.json', name: 'data', ext: 'json', capabilities: cap('sheet-readonly') },
  { path: '/demo/wknd/images', name: 'images', displayName: 'Images', contentProfile: 'aem-import', capabilities: cap('browse') },
  { path: '/demo/wknd/native.png', name: 'native', ext: 'png', displayName: 'native.png', contentProfile: 'native-da' },
];

describe('v2 da-list imported wiring', () => {
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

  async function fixture(view) {
    el = document.createElement('da-list');
    Object.assign(el, { view, select: true, drag: true, editor: '/edit#', listItems: ITEMS.map((item) => ({ ...item })) });
    el._readOnlyContent = true;
    const update = spy(el, 'update');
    document.body.appendChild(el);
    await el.updateComplete;
    await update.firstCall.returnValue;
    await el.updateComplete;
    update.restore();
    await Promise.all([...el.shadowRoot.querySelectorAll('da-file-item')].map((row) => row.updateComplete));
  }

  const row = (filename) => [...el.shadowRoot.querySelectorAll('da-file-item')].find((item) => item.path === `/demo/wknd/${filename}`);

  ['list', 'card'].forEach((view) => {
    it(`renders ${view} rows with no link for pages and working links for folder, image, sheet`, async () => {
      await fixture(view);
      const page = row('page.html');
      expect(page.hasAttribute('readonlycontent')).to.equal(true);
      expect(page.shadowRoot.querySelector('a')).to.equal(null);
      expect(page.shadowRoot.querySelector('[aria-disabled="true"]')).to.exist;
      const href = (name) => row(name).shadowRoot.querySelector('a[href]').getAttribute('href');
      expect(href('images')).to.equal('#/demo/wknd/images');
      expect(href('hero.png')).to.contain('/media#/demo/wknd/hero.png');
      expect(href('data.json')).to.contain('/sheet#/demo/wknd/data');
      const selector = view === 'card'
        ? '[slot="heading"]'
        : '.da-item-list-item-name-text';
      const label = (filename) => (
        row(filename).shadowRoot.querySelector(selector).textContent.trim()
      );
      expect(label('images')).to.equal('Images');
      expect(label('hero.png')).to.equal('Hero Source.png');
      expect(label('native.png')).to.equal('native');
    });
  });

  it('offers no selection or drop area', async () => {
    await fixture('list');
    expect(el.shadowRoot.querySelector('.da-browse-panel-header input[type="checkbox"]')).to.equal(null);
    expect(el.shadowRoot.querySelector('.da-list-types-popover input[type="checkbox"]')).to.exist;
    expect(el.shadowRoot.querySelector('.da-drop-area')).to.equal(null);
    expect(row('hero.png').allowselect).not.to.equal(true);
  });
});
