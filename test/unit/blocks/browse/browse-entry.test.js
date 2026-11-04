import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import init from '../../../../blocks/browse/browse.js';
import { getNx, getNx2Api } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { source } = await getNx2Api();

describe('Browse Content opt-in', () => {
  it('loads only Content for landing=true and preserves ordinary Browse for landing=home', async () => {
    const { href } = window.location;
    const ordinary = document.createElement('div');
    const content = document.createElement('div');
    const browse = document.createElement('da-browse');
    ordinary.append(browse);
    document.body.append(ordinary, content);
    const list = sinon.stub(source, 'list').resolves({ ok: true, items: [] });
    try {
      const url = new URL(href);
      url.searchParams.set('landing', 'home');
      window.history.replaceState(null, '', url);
      hashChange._set({ org: 'org', site: 'site' });
      await init(ordinary);
      expect(ordinary.firstElementChild).to.equal(browse);
      expect(browse.details.site).to.equal('site');
      expect(ordinary.querySelector('da-landing')).to.equal(null);
      url.searchParams.set('landing', 'true');
      window.history.replaceState(null, '', url);
      const landing = await init(content);
      await landing.updateComplete;
      expect(content.firstElementChild.className).to.equal('landing');
      expect(content.firstElementChild.firstElementChild).to.equal(landing);
      expect(landing.localName).to.equal('da-landing');
      expect(landing.shadowRoot.querySelector('.files-panel')).not.to.equal(null);
      expect(landing.shadowRoot.querySelector('h1, textarea, .composer')).to.equal(null);
    } finally {
      ordinary.remove();
      content.remove();
      list.restore();
      window.history.replaceState(null, '', href);
      localStorage.removeItem('da-sites');
    }
  });
});
