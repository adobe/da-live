/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx, getNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
await import('../../../../../blocks/canvas/ew-panel-extensions/ew-panel-extensions.js');

const nextUpdate = () => new Promise((resolve) => { setTimeout(resolve); });

describe('ew-panel-extension page context', () => {
  let el;

  beforeEach(() => {
    hashChange._set({ org: 'example-org', site: 'example-site', path: 'page-a' });
    el = document.createElement('ew-panel-extension');
    el._handlePluginLoad = () => {};
  });

  afterEach(() => {
    el.remove();
    hashChange._set({});
  });

  it('remounts a configured extension iframe when the page path changes', async () => {
    el.extension = {
      name: 'configured-tool',
      title: 'Configured tool',
      sources: ['about:blank'],
    };
    document.body.append(el);
    await nextUpdate();
    const first = el.shadowRoot.querySelector('iframe');

    hashChange._set({ org: 'example-org', site: 'example-site', path: 'page-b' });
    await nextUpdate();

    const second = el.shadowRoot.querySelector('iframe');
    expect(second).to.exist;
    expect(second).to.not.equal(first);
  });

  it('retains a first-party extension element when the page path changes', async () => {
    el.extension = {
      name: 'templates',
      title: 'Templates',
      ootb: true,
      sources: [],
    };
    document.body.append(el);
    await nextUpdate();
    const first = el.shadowRoot.querySelector('ew-panel-library');

    hashChange._set({ org: 'example-org', site: 'example-site', path: 'page-b' });
    await nextUpdate();

    expect(el.shadowRoot.querySelector('ew-panel-library')).to.equal(first);
  });
});
