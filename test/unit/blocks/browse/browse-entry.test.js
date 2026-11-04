import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import init from '../../../../blocks/browse/browse.js';
import { getNx } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);

describe('isolated tile preview composition', () => {
  it('mounts tiles inside the real gated landing surface instead of replacing its wrapper', async () => {
    const { href } = window.location;
    const el = document.createElement('div');
    el.innerHTML = '<picture></picture>';
    document.body.append(el);
    try {
      const url = new URL(href);
      url.searchParams.set('landing', 'true');
      window.history.replaceState(null, '', url);
      hashChange._set(undefined);
      const mounted = new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          const preview = el.querySelector('.landing > da-landing');
          if (!preview) return;
          observer.disconnect();
          resolve(preview);
        });
        observer.observe(el, { childList: true, subtree: true });
      });
      init(el);
      const landing = await mounted;
      await landing.updateComplete;
      expect(el.children).to.have.length(1);
      expect(landing.parentElement.className).to.equal('landing');
      expect(el.querySelector('picture, da-sites, da-browse')).to.equal(null);
      expect(landing.shadowRoot.querySelectorAll('da-landing-tile')).to.have.length(5);
      expect(landing.shadowRoot.querySelector('.files-panel, .composer')).to.equal(null);
    } finally {
      el.remove();
      window.history.replaceState(null, '', href);
    }
  });
});
