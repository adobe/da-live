import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import init, { parseTileEntries } from '../../../../blocks/browse/tiles/tile-group.js';

const content = `<div class="browse">
  <div>
    <div>:s2-icon-folderopen-20-n:</div>
    <div><h3 id="browse-content"><a href="/#/aem-sandbox/block-collection">Browse</a></h3><p>Browse files</p></div>
    <div>tone: turquoise</div>
  </div>
  <div>
    <div>:s2-icon-add-20-n:</div>
    <div><h3 id="add-site"><a href="/start">Add a site</a></h3><p>Set up a new site</p></div>
    <div>tone: green</div>
  </div>
  <div>
    <div>:s2-icon-publish-20-n:</div>
    <div><h3><a href="https://example.com/guide">Guide</a></h3><ul><li><p>Read the guide</p></li></ul></div>
    <div><p>id: guide</p><p>tone: purple</p></div>
  </div>
</div>`;

describe('Browse tile group', () => {
  let el;
  let block;

  beforeEach(async () => {
    const container = document.createElement('div');
    container.innerHTML = content;
    block = container.firstElementChild;
    el = document.createElement('da-browse-tiles');
    el.entries = parseTileEntries(block);
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
  });

  it('preserves authored order, metadata and description text, accepting decorated icons', async () => {
    block.children[0].children[0].innerHTML = '<span class="icon icon-s2-icon-folderopen-20-n"></span>';
    block.prepend(block.lastElementChild);
    block.insertAdjacentHTML('beforeend', '<div><div>Missing icon and title</div></div>');
    const warn = sinon.stub(console, 'warn');
    el.entries = parseTileEntries(block);
    await el.updateComplete;
    expect(warn.calledOnce).to.equal(true);
    expect(el.entries.map(({ heading }) => heading)).to.deep.equal(['Guide', 'Browse', 'Add a site']);
    expect(el.entries[0]).to.deep.equal({
      id: 'guide',
      heading: 'Guide',
      description: 'Read the guide',
      iconHref: '/img/icons/s2-icon-publish-20-n.svg',
      href: 'https://example.com/guide',
      tone: 'purple',
    });
    expect(el.entries[1].iconHref).to.equal('/img/icons/s2-icon-folderopen-20-n.svg');
  });

  it('renders authored native links without rewriting their destinations', () => {
    const links = [...el.shadowRoot.querySelectorAll('a.tile')];
    expect(links.map((link) => link.getAttribute('href'))).to.deep.equal([
      '/#/aem-sandbox/block-collection', '/start', 'https://example.com/guide',
    ]);
  });

  it('omits unsupported authored URLs using shared validation', () => {
    block.querySelector('a').setAttribute('href', 'data:text/html,test');
    const warn = sinon.stub(console, 'warn');
    expect(parseTileEntries(block).map(({ heading }) => heading)).to.deep.equal(['Add a site', 'Guide']);
    expect(warn.calledOnce).to.equal(true);
  });

  it('reuses the initialized tiles without reparsing or replacing them', () => {
    el.remove();
    el = init(block);
    expect(init(block)).to.equal(el);
    expect(block.firstElementChild).to.equal(el);
    expect(el.entries).to.have.length(3);
  });

  it('reports native link clicks without taking over navigation', () => {
    const { hlx } = window;
    const sampleRUM = sinon.spy();
    window.hlx = { rum: { sampleRUM } };
    el.shadowRoot.addEventListener('click', (event) => {
      expect(event.defaultPrevented).to.equal(false);
      event.preventDefault();
    });
    try {
      const [browse, addSite] = el.shadowRoot.querySelectorAll('.tile');
      expect(browse.localName).to.equal('a');
      expect(addSite.localName).to.equal('a');
      browse.click();
      addSite.click();
      expect(sampleRUM.args).to.deep.equal([
        ['click', { source: 'landing-action-browse-content', target: browse.href }],
        ['click', { source: 'landing-action-add-site', target: addSite.href }],
      ]);
    } finally {
      window.hlx = hlx;
    }
  });
});
