import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import init from '../../../../blocks/browse/browse.js';
import { getNx } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('landing tile composition', () => {
  it('mounts one tile group inside the gated landing when updates overlap', async () => {
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
      hashChange._set(undefined);
      const tiles = await mounted;
      while (!tiles.entries) await new Promise((resolve) => { setTimeout(resolve, 0); });
      await tiles.updateComplete;
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      expect(el.children).to.have.length(1);
      expect(el.querySelectorAll('da-landing-tiles')).to.have.length(1);
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

  it('renders the page’s own Landing table without a parameter or fetch', async () => {
    const main = document.createElement('main');
    main.innerHTML = content.replace(/<\/?main>/g, '');
    const el = main.querySelector('.browse');
    const block = main.querySelector('.landing');
    document.body.append(main);
    const fetchContent = sinon.spy(window, 'fetch');
    try {
      init(el);
      let tiles;
      while (!tiles?.entries) {
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        tiles = el.querySelector('.landing > da-landing-tiles');
      }
      await tiles.updateComplete;
      expect(tiles.shadowRoot.querySelectorAll('da-landing-tile')).to.have.length(5);
      expect(el.querySelector('da-sites')).to.equal(null);
      expect(block.querySelectorAll(':scope > div')).to.have.length(5);
      expect(fetchContent.calledWith('/drafts/mhaack/landing-copy')).to.equal(false);
    } finally {
      fetchContent.restore();
      main.remove();
    }
  });
});
