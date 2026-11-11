import { expect } from '@esm-bundle/chai';
import { loadCards, parseCards } from '../../../../blocks/onboarding/content.js';

const CARDS_HTML = `
  <div class="add-site"><div><div></div></div></div>
  <div class="nx-cards start">
    <div>
      <div><span class="icon icon-TreeView"></span><em>#E5F0FE</em></div>
      <div>
        <h3><a href="/apps/traverse">Traverse</a></h3>
        <p>Get a birds eye view</p>
        <p>of the content.</p>
        <ul><li><a href="https://www.aem.live/docs">Learn more</a></li></ul>
      </div>
    </div>
    <div>
      <div></div>
      <div><h3>Coming soon</h3><p>No link yet.</p></div>
    </div>
  </div>`;

const parse = (markup) => new DOMParser().parseFromString(markup, 'text/html').querySelector('.nx-cards');

describe('onboarding/content', () => {
  let savedFetch;

  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('maps authored rows to card data', () => {
    expect(parseCards(parse(CARDS_HTML))).to.deep.equal([
      {
        heading: 'Traverse',
        description: 'Get a birds eye view of the content.',
        icon: '/img/icons/s2-icon-treeview-20-n.svg',
        tint: '#E5F0FE',
        href: '/apps/traverse',
      },
      {
        heading: 'Coming soon',
        description: 'No link yet.',
        icon: undefined,
        tint: undefined,
        href: undefined,
      },
    ]);
  });

  it('loads the cards from the plain html', async () => {
    const urls = [];
    window.fetch = async (url) => {
      urls.push(url);
      return new Response(CARDS_HTML);
    };
    const { cards } = await loadCards('/cards-ok');
    expect(urls).to.deep.equal(['/cards-ok.plain.html']);
    expect(cards.map(({ heading }) => heading)).to.deep.equal(['Traverse', 'Coming soon']);
  });

  it('returns an error for a failed or rejected request', async () => {
    window.fetch = async () => new Response('', { status: 404 });
    expect(await loadCards('/cards-missing')).to.deep.equal({ error: 'Could not load onboarding content.', status: 404 });
    window.fetch = async () => { throw new Error('offline'); };
    expect(await loadCards('/cards-missing')).to.deep.equal({ error: 'Could not load onboarding content.' });
  });
});
