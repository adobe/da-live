/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { isFileItemOpenable } from '../../../../../blocks/shared/da-file-item/navigation.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/shared/da-file-item/da-file-item.js');

const NONE = { canOpen: false, canWrite: false, readOnly: true, view: 'none' };
const MEDIA = { canOpen: true, canWrite: false, readOnly: true, view: 'media' };
const SHEET = { canOpen: true, canWrite: false, readOnly: true, view: 'sheet-readonly' };
const BROWSE = { canOpen: true, canWrite: false, readOnly: true, view: 'browse' };

describe('da-file-item capability gating', () => {
  let el;

  async function fixture(props = {}) {
    el = document.createElement('da-file-item');
    Object.assign(el, {
      idx: 0,
      name: 'page',
      path: '/demo/wknd/page.html',
      ext: 'html',
      editor: '/edit#',
      allowselect: false,
      readOnlyContent: true,
      ...props,
    });
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  afterEach(() => {
    el?.remove();
    el = null;
  });

  it('treats missing capabilities as openable and canOpen false as not openable', () => {
    expect(isFileItemOpenable({})).to.equal(true);
    expect(isFileItemOpenable({ capabilities: MEDIA })).to.equal(true);
    expect(isFileItemOpenable({ capabilities: NONE })).to.equal(false);
  });

  it('renders a non-openable row without any link, in tab order or editor href', async () => {
    await fixture({ capabilities: NONE });
    const title = el.shadowRoot.querySelector('.da-item-list-item-title');
    expect(title.tagName).to.equal('SPAN');
    expect(title.getAttribute('aria-disabled')).to.equal('true');
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title')).to.equal(null);
    expect(el.shadowRoot.innerHTML).not.to.contain('/edit#');
  });

  it('ignores an explicit href when the item is not openable', async () => {
    await fixture({ capabilities: NONE, href: '/edit#/demo/wknd/page' });
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title')).to.equal(null);
  });

  it('renders a non-openable card with no links', async () => {
    await fixture({ capabilities: NONE, view: 'card' });
    expect(el.shadowRoot.querySelector('a')).to.equal(null);
    expect(el.shadowRoot.querySelector('[slot="heading"]').getAttribute('aria-disabled')).to.equal('true');
  });

  it('keeps folder navigation for browse capabilities', async () => {
    await fixture({ capabilities: BROWSE, ext: '', path: '/demo/wknd/images', name: 'images' });
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title').getAttribute('href'))
      .to.equal('#/demo/wknd/images');
  });

  it('keeps media and read-only sheet links', async () => {
    await fixture({ capabilities: MEDIA, ext: 'png', path: '/demo/wknd/hero.png', name: 'hero' });
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title').getAttribute('href'))
      .to.contain('/media#/demo/wknd/hero.png');
    el.remove();
    await fixture({ capabilities: SHEET, ext: 'json', path: '/demo/wknd/data.json', name: 'data' });
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title').getAttribute('href'))
      .to.contain('/sheet#/demo/wknd/data');
  });

  it('hides the details control and never queries status when read-only', async () => {
    await fixture({ capabilities: MEDIA, ext: 'png', path: '/demo/wknd/hero.png' });
    expect(el.shadowRoot.querySelector('[aria-label="More info"]')).to.equal(null);
    let status = 0;
    el.updateAEMStatus = () => { status += 1; };
    el.updateDAStatus = () => { status += 1; };
    await el.toggleDetails({ currentTarget: el });
    expect(status).to.equal(0);
  });

  it('does not move an item on rename submit when read-only', async () => {
    await fixture({ rename: true, capabilities: MEDIA });
    let moved = false;
    el.doesFileExist = async () => {
      moved = true;
      return false;
    };
    const form = el.shadowRoot.querySelector('form.da-item-list-item-rename');
    form.querySelector('input').value = 'other';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await el.updateComplete;
    expect(moved).to.equal(false);
    expect(el.name).to.equal('page');
  });

  it('is unchanged for native items without capabilities', async () => {
    await fixture({ readOnlyContent: false });
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title').getAttribute('href'))
      .to.contain('/edit#/demo/wknd/page');
    expect(el.shadowRoot.querySelector('[aria-label="More info"]')).to.exist;
  });
});
