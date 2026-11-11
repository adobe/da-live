import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readLandingBlocks, loadLandingContent } from '../../../../blocks/landing/landing-content.js';

const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('Landing layout content', () => {
  afterEach(() => sinon.restore());

  it('copies authored block order without copying the Browse route host or its rendered surface', () => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    doc.querySelector('.browse').innerHTML = '<div class="landing">Old route surface</div>';
    doc.querySelector('.greeting').hidden = true;
    const blocks = readLandingBlocks(doc);
    expect(blocks.map((block) => block.className)).to.deep.equal(['greeting', 'recent-files', 'landing']);
    expect(blocks[0].hidden).to.equal(false);
    blocks[0].querySelector('h1').textContent = 'Changed';
    expect(doc.querySelector('h1').textContent).to.include('[firstname]');
  });

  it('shares in-flight and successful content requests without hydrating cached blocks', async () => {
    let finish;
    const fetchContent = sinon.stub(window, 'fetch').returns(new Promise((resolve) => {
      finish = resolve;
    }));
    const first = loadLandingContent('/layout-shared');
    const second = loadLandingContent('/layout-shared');
    finish(new Response(content));
    const result = await first;
    expect(await second).to.equal(result);
    expect(await loadLandingContent('/layout-shared')).to.equal(result);
    expect(result.blocks[0].querySelector('h1').textContent).to.include('[firstname]');
    expect(fetchContent.calledOnceWithExactly('/layout-shared.plain.html')).to.equal(true);
  });

  it('retries HTTP, network and empty-content failures without inventing sections', async () => {
    const fetchContent = sinon.stub(window, 'fetch');
    fetchContent.onFirstCall().resolves(new Response('', { status: 503 }));
    fetchContent.onSecondCall().rejects(new Error('Offline'));
    fetchContent.onThirdCall().resolves(new Response('<div class="browse"></div>'));
    fetchContent.onCall(3).resolves(new Response(content));
    expect((await loadLandingContent('/layout-retry')).error).to.include('Could not load');
    expect((await loadLandingContent('/layout-retry')).error).to.include('Could not load');
    expect((await loadLandingContent('/layout-retry')).error).to.include('No Landing content');
    expect((await loadLandingContent('/layout-retry')).blocks).to.have.length(3);
  });
});
