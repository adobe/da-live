import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });
await import('../../../../../../blocks/browse/legacy/da-list-item/da-list-item.js');

describe('legacy da-list-item capability gating', () => {
  let el;

  async function fixture(props = {}) {
    el = document.createElement('da-list-item');
    Object.assign(el, {
      idx: 0, name: 'page', path: '/demo/wknd/page.html', ext: 'html', editor: '/edit#', readOnlyContent: true, ...props,
    });
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();
  }

  afterEach(() => el?.remove());

  it('renders a non-openable row without a link', async () => {
    await fixture({ capabilities: { canOpen: false, readOnly: true, view: 'none' } });
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title')).to.equal(null);
    expect(el.shadowRoot.querySelector('span.da-item-list-item-title').getAttribute('aria-disabled')).to.equal('true');
    expect(el.shadowRoot.querySelector('.da-item-list-item-expand-btn').classList.contains('is-visible')).to.equal(false);
  });

  it('keeps folder and sheet navigation', async () => {
    await fixture({ ext: '', path: '/demo/wknd/images', capabilities: { canOpen: true, readOnly: true, view: 'browse' } });
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title').getAttribute('href')).to.equal('#/demo/wknd/images');
    el.remove();
    await fixture({ ext: 'json', path: '/demo/wknd/data.json', capabilities: { canOpen: true, readOnly: true, view: 'sheet-readonly' } });
    expect(el.shadowRoot.querySelector('a.da-item-list-item-title').getAttribute('href')).to.contain('/sheet#/demo/wknd/data');
  });

  it('does not expand details when read-only', async () => {
    await fixture({ capabilities: { canOpen: true, readOnly: true, view: 'media' }, ext: 'png', path: '/demo/wknd/a.png' });
    el.toggleExpand();
    expect(el.classList.contains('is-expanded')).to.equal(false);
  });
});
