import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let parseSections;

before(async () => {
  ({ parseSections } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
});

const URL_TEXT = 'https://delivery-p1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.jpg';
const linkImage = (index = 4) => `<a href="${URL_TEXT}" title="Hero" data-edit-as="image" data-image-index="${index}" data-image-version="v1">${URL_TEXT}</a>`;

const sectionsOf = (body) => parseSections(`<body><main><div>${body}</div></main></body>`);
const childrenOf = (body) => sectionsOf(body)[0].items.flatMap((item) => item.children ?? []);

describe('parseSections with link-images', () => {
  it('shows a link-image-only paragraph as an image', () => {
    const [child] = childrenOf(`<p data-prose-index="3">${linkImage(4)}</p>`);
    expect(child && child.kind).to.equal('image');
    expect(child && child.proseIndex).to.equal(4);
  });

  it('keeps the URL out of the image snippet and text', () => {
    const [child] = childrenOf(`<p data-prose-index="3">${linkImage(4)}</p>`);
    expect(child.innerText).to.equal('');
    expect(child.snippet).to.equal('');
  });

  it('keeps the URL out of paragraph text next to a link-image', () => {
    const [child] = childrenOf(`<p data-prose-index="3">Intro ${linkImage(4)}</p>`);
    expect(child.kind).to.equal('paragraph');
    expect(child.innerText).to.equal('Intro');
    expect(child.snippet).to.equal('Intro');
  });

  it('keeps the URL out of a content run text', () => {
    const [section] = sectionsOf(`<h2 data-prose-index="1">Title</h2><p data-prose-index="3">${linkImage(4)}</p>`);
    const run = section.items.find((item) => item.type === 'content');
    expect(run.innerText).to.equal('Title');
    expect(run.children.map((c) => c.kind)).to.deep.equal(['heading', 'image']);
  });

  it('keeps the URL out of block text', () => {
    const [section] = sectionsOf(
      '<div class="cards" data-block-index="9"><div><div>'
      + `<p data-prose-index="11">Card text</p><p data-prose-index="13">${linkImage(14)}</p>`
      + '</div></div></div>',
    );
    expect(section.blocks[0].innerText).to.equal('Card text');
  });

  it('keeps the URL text of a regular link', () => {
    const [child] = childrenOf('<p data-prose-index="3"><a href="https://example.com/x">https://example.com/x</a></p>');
    expect(child.kind).to.equal('paragraph');
    expect(child.innerText).to.equal('https://example.com/x');
  });

  it('still shows a regular image as an image', () => {
    const [child] = childrenOf('<p data-prose-index="3"><img src="/a.png" data-image-index="4"></p>');
    expect(child.kind).to.equal('image');
    expect(child.proseIndex).to.equal(4);
  });
});
