import { expect } from '@esm-bundle/chai';
import { readLandingBlocks } from '../../../../blocks/landing/landing-content.js';

const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('Landing layout content', () => {
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
});
