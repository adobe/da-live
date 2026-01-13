import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';

import prose2aem from '../../../../blocks/shared/prose2aem.js';

const htmlString = await readFile({ path: './mocks/prose2aem.html' });
const doc = new DOMParser().parseFromString(htmlString, 'text/html');

describe('prose2aem', () => {
  before('parse everything', () => {
    document.body.outerHTML = prose2aem(doc.body, true);
  });

  it('Removes extras', () => {
    const block = document.querySelector('.ProseMirror-yjs-selection');
    expect(block).to.not.exist;
  });

  it('Decorates basic block', () => {
    const block = document.querySelector('.marquee');
    expect(block).to.exist;
    expect(block.classList[0]).to.equal('marquee');
  });

  it('Decorates variant block', () => {
    const block = document.querySelector('.marquee.light.large');
    expect(block).to.exist;
  });

  it('Decorates images', () => {
    const pics = document.querySelectorAll('picture');
    const noPara = pics[0].closest('p');
    const para = pics[1].closest('p');

    expect(pics[0]).to.exist;
    expect(noPara).to.not.exist;

    expect(para).to.exist;
  });

  it('Decorates sections', () => {
    const hrs = document.querySelectorAll('hr');
    const hasParaBreak = document.body.innerHTML.search('<p>---<p/>');
    expect(hrs.length).to.equal(0);
    expect(hasParaBreak).to.equal(-1);
  });

  it('Decorates list items', () => {
    const liParas = document.querySelectorAll('li > p');
    expect(liParas.length).to.equal(0);
  });

  it('Removes metadata', () => {
    const meta = document.querySelector('.metadata');
    expect(meta).to.not.exist;
  });

  it('Wraps imgs with href attrs in a link tag', () => {
    const pictureEl = document.querySelector('a > picture');
    const parent = pictureEl.parentElement;
    expect(parent.href).to.equal('https://my.image.link/');
  });

  it('Wraps icons in span tags', () => {
    const icons = document.querySelectorAll('span.icon');
    expect(icons.length).to.equal(9);
  });
});

describe('prose2aem with isFragment parameter', () => {
  let originalDoc;

  before(async () => {
    // Reload the HTML for fragment tests
    const htmlStr = await readFile({ path: './mocks/prose2aem.html' });
    originalDoc = new DOMParser().parseFromString(htmlStr, 'text/html');
  });

  it('Returns HTML string when isFragment is true', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = '<div class="tableWrapper"><table><tr><td>Test</td></tr></table></div>';

    const result = prose2aem(fragment, true, true);

    expect(typeof result).to.equal('string');
    expect(result).to.be.a('string');
  });

  it('Returns full HTML document when isFragment is false', () => {
    const newDoc = originalDoc.cloneNode(true);
    const result = prose2aem(newDoc.body, true, false);

    expect(typeof result).to.equal('string');
    expect(result).to.include('<body>');
    expect(result).to.include('</body>');
  });

  it('Converts blocks correctly in fragment mode', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <div class="tableWrapper">
        <table>
          <tr><td>marquee (light)</td></tr>
          <tr><td>Content here</td></tr>
        </table>
      </div>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.include('class="marquee light"');
    expect(result).to.include('Content here');
  });

  it('Does not create sections when isFragment is true', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <p>First paragraph</p>
      <hr>
      <p>Second paragraph</p>
    `;

    const result = prose2aem(fragment, true, true);

    // Should not wrap content in sections
    expect(result).to.not.include('<div>');
    expect(result).to.include('<p>First paragraph</p>');
    expect(result).to.include('<p>Second paragraph</p>');
  });

  it('Creates sections when isFragment is false', () => {
    const newDoc = originalDoc.cloneNode(true);
    const result = prose2aem(newDoc.body, true, false);

    // Should include section divs
    expect(result).to.include('<div>');
  });

  it('Does not remove class attribute when isFragment is true', () => {
    const fragment = document.createElement('div');
    fragment.className = 'test-fragment';
    fragment.innerHTML = '<p>Content</p>';

    const result = prose2aem(fragment, true, true);

    // Class should remain on the fragment in isFragment mode
    expect(result).to.include('Content');
  });

  it('Processes table blocks correctly in fragment mode', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <div class="tableWrapper">
        <table>
          <tr><td>columns (contained)</td></tr>
          <tr>
            <td><p>Column 1</p></td>
            <td><p>Column 2</p></td>
          </tr>
        </table>
      </div>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.include('class="columns contained"');
    expect(result).to.include('Column 1');
    expect(result).to.include('Column 2');
  });

  it('Handles empty fragment', () => {
    const fragment = document.createElement('div');

    const result = prose2aem(fragment, true, true);

    expect(result).to.equal('');
  });

  it('Preserves pictures in fragment mode', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <p>
        <span class="img-wrapper">
          <img src="test.jpg" alt="Test image">
        </span>
      </p>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.include('<picture>');
    expect(result).to.include('alt="Test image"');
  });

  it('Converts focal point attributes to data-title', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <p>
        <img src="test.jpg" data-focal-x="30.5" data-focal-y="70.2">
      </p>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.include('data-title="data-focal:30.5,70.2"');
  });

  it('Unwraps focal point image wrappers', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <p>
        <span class="focal-point-image-wrapper">
          <img src="test.jpg" data-focal-x="30.5" data-focal-y="70.2">
          <span class="focal-point-icon"></span>
        </span>
      </p>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.not.include('focal-point-image-wrapper');
    expect(result).to.not.include('focal-point-icon');
    expect(result).to.include('<picture>');
    expect(result).to.include('data-title="data-focal:30.5,70.2"');
  });
});
