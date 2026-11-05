import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import init from '../../../../blocks/browse/browse.js';
import { getNx } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('landing tile composition', () => {
  it('mounts tiles inside the real gated landing surface instead of replacing its wrapper', async () => {
    const { href } = window.location;
    const el = document.createElement('div');
    el.innerHTML = '<picture></picture>';
    document.body.append(el);
    const fetchContent = sinon.stub(window, 'fetch').resolves(new Response(content));
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
      while (!tiles.entries) await new Promise((resolve) => { setTimeout(resolve, 0); });
      await tiles.updateComplete;
      expect(el.children).to.have.length(1);
      expect(tiles.parentElement.className).to.equal('landing');
      expect(el.querySelector('picture, da-sites, da-browse')).to.equal(null);
      expect(tiles.shadowRoot.querySelectorAll('da-landing-tile')).to.have.length(5);
      expect(tiles.shadowRoot.querySelector('.files-panel, .composer')).to.equal(null);
      expect(fetchContent.calledOnceWithExactly('/drafts/mhaack/landing-copy')).to.equal(true);
    } finally {
      fetchContent.restore();
      observer?.disconnect();
      el.remove();
      window.history.replaceState(null, '', href);
    }
  });
});
