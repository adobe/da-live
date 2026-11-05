import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { parseTileEntries, loadTileEntries } from '../../../../blocks/landing/tile-content.js';

const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('authored landing tiles', () => {
  afterEach(() => sinon.restore());

  it('reads the published three-column table without executing or rendering the Browse block', () => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const entries = parseTileEntries(doc.querySelector('.landing'));
    expect(entries).to.have.length(5);
    expect(entries[0]).to.deep.equal({
      id: 'browse-content',
      heading: 'Browse Content',
      description: 'View your recent, favorite, or other content by their organization',
      iconHref: '/img/icons/s2-icon-folderopen-20-n.svg',
      href: '/#/%7Borg%7D/%7Bsite%7D',
      tone: 'green',
    });
    expect(entries[4].tone).to.equal(undefined);
  });

  it('honors editable metadata and row order, ignoring incomplete rows', () => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const block = doc.querySelector('.landing');
    const row = block.lastElementChild;
    row.children[1].querySelector('a').textContent = 'Custom heading';
    row.lastElementChild.textContent = 'tone: purple id: stable-action';
    block.prepend(row);
    block.append(document.createElement('div'));
    const entries = parseTileEntries(block);
    expect(entries).to.have.length(5);
    expect(entries[0].heading).to.equal('Custom heading');
    expect(entries[0].tone).to.equal('purple');
    expect(entries[0].id).to.equal('stable-action');
    expect(parseTileEntries(null)).to.deep.equal([]);
  });

  it('shares an in-flight content request and caches successful parsed data', async () => {
    let finish;
    const fetchContent = sinon.stub(window, 'fetch').returns(new Promise((resolve) => { finish = resolve; }));
    const first = loadTileEntries('/landing-shared');
    const second = loadTileEntries('/landing-shared');
    expect(fetchContent.calledOnce).to.equal(true);
    finish(new Response(content));
    const result = await first;
    expect(await second).to.equal(result);
    expect(result.entries).to.have.length(5);
    expect(await loadTileEntries('/landing-shared')).to.equal(result);
    expect(fetchContent.calledOnce).to.equal(true);
  });

  it('reports failures without falling back to hardcoded tiles and allows a later retry', async () => {
    const fetchContent = sinon.stub(window, 'fetch');
    fetchContent.onFirstCall().resolves(new Response('', { status: 503 }));
    fetchContent.onSecondCall().rejects(new Error('Offline'));
    fetchContent.onThirdCall().resolves(new Response('<main></main>'));
    fetchContent.onCall(3).resolves(new Response(content));
    expect(await loadTileEntries('/landing-retry')).to.deep.equal({ error: 'Could not load quick links.', status: 503 });
    expect((await loadTileEntries('/landing-retry')).error).to.equal('Could not load quick links.');
    expect((await loadTileEntries('/landing-retry')).error).to.equal('No quick links are configured.');
    expect((await loadTileEntries('/landing-retry')).entries).to.have.length(5);
  });
});
