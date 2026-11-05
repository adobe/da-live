import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import init from '../../../../blocks/browse/browse.js';
import { getNx } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);

describe('landing tile composition', () => {
  it('mounts tiles inside the real gated landing surface instead of replacing its wrapper', async () => {
    const { href } = window.location;
    const el = document.createElement('div');
    el.innerHTML = '<picture></picture>';
    document.body.append(el);
    let observer;
    try {
      const url = new URL(href);
      url.searchParams.set('landing', 'true');
      window.history.replaceState(null, '', url);
      hashChange._set(undefined);
      const mounted = new Promise((resolve) => {
        observer = new MutationObserver(() => {
          const tiles = el.querySelector('.landing > da-landing-tiles');
          if (!tiles) return;
          observer.disconnect();
          resolve(tiles);
        });
        observer.observe(el, { childList: true, subtree: true });
      });
      init(el);
      const tiles = await mounted;
      await tiles.updateComplete;
      expect(el.children).to.have.length(1);
      expect(tiles.parentElement.className).to.equal('landing');
      expect(el.querySelector('picture, da-sites, da-browse')).to.equal(null);
      expect(tiles.shadowRoot.querySelectorAll('da-landing-tile')).to.have.length(5);
      expect(tiles.shadowRoot.querySelector('.files-panel, .composer')).to.equal(null);
    } finally {
      observer?.disconnect();
      el.remove();
      window.history.replaceState(null, '', href);
    }
  });
});
