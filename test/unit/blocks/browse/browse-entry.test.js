import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import init from '../../../../blocks/browse/browse.js';
import '../../../../blocks/landing/landing.js';
import { getNx, getNx2Api } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { source, config } = await getNx2Api();

describe('Browse Content opt-in', () => {
  it('preserves site Browse with landing=true and updates root Content from nav without changing its URL', async () => {
    const { href } = window.location;
    const ordinary = document.createElement('div');
    const browse = document.createElement('da-browse');
    ordinary.append(browse);
    document.body.append(ordinary);
    const list = sinon.stub(source, 'list').resolves({ ok: true, items: [] });
    const configs = sinon.stub(config, 'get').resolves({ ok: true, json: async () => ({ data: [] }) });
    try {
      const url = new URL(href);
      url.searchParams.set('landing', 'true');
      url.hash = '/org/site';
      window.history.replaceState(null, '', url);
      hashChange._set({ org: 'org', site: 'site' });
      await init(ordinary);
      expect(ordinary.firstElementChild).to.equal(browse);
      expect(browse.details.site).to.equal('site');
      expect(ordinary.querySelector('da-landing')).to.equal(null);
      url.hash = '';
      window.history.replaceState(null, '', url);
      const mounted = new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          const landing = ordinary.querySelector('da-landing');
          if (!landing) return;
          observer.disconnect();
          resolve(landing);
        });
        observer.observe(ordinary, { childList: true, subtree: true });
      });
      hashChange._set(undefined);
      const landing = await mounted;
      await landing.updateComplete;
      expect(ordinary.querySelector('da-browse')).to.equal(null);
      expect(ordinary.firstElementChild.className).to.equal('landing');
      expect(ordinary.firstElementChild.firstElementChild).to.equal(landing);
      expect(landing.localName).to.equal('da-landing');
      expect(landing.path).to.equal('');
      const { href: rootHref } = window.location;
      expect(landing.shadowRoot.querySelector('nx-siteselector')).to.equal(null);
      const selection = sinon.spy(landing, 'setScope');
      document.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'org/site' } }));
      await selection.returnValues[0];
      await landing.updateComplete;
      expect(landing.path).to.equal('/org/site');
      expect(window.location.href).to.equal(rootHref);
      expect(landing.shadowRoot.querySelector('.files-panel')).not.to.equal(null);
      expect(landing.shadowRoot.querySelector('h1, textarea, .composer')).to.equal(null);
    } finally {
      ordinary.remove();
      list.restore();
      configs.restore();
      window.history.replaceState(null, '', href);
      localStorage.removeItem('da-sites');
    }
  });

  it('waits for the landing gradient surface before the section is shown', async () => {
    const { href } = window.location;
    const el = document.createElement('div');
    el.innerHTML = '<div><picture><img alt=""></picture></div>';
    document.body.append(el);
    try {
      const url = new URL(href);
      url.searchParams.set('landing', 'true');
      url.hash = '';
      window.history.replaceState(null, '', url);
      hashChange._set(undefined);
      const ready = init(el);
      expect(ready).to.be.instanceOf(Promise);
      await ready;
      expect(el.querySelector('picture')).to.equal(null);
      expect(el.firstElementChild.className).to.equal('landing');
    } finally {
      el.remove();
      window.history.replaceState(null, '', href);
    }
  });
});
