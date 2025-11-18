import { expect } from '@esm-bundle/chai';
import { generateDiff } from '../../../../../../blocks/edit/prose/diff/generate-diff.js';

describe('generateDiff', () => {
  it('returns no-content message when both inputs are empty', () => {
    const result = generateDiff('', '');
    expect(result).to.equal('<p style="text-align: center; color: #666; margin: 20px 0;">No content to compare</p>');
  });

  it('wraps identical non-empty content in html-diff container', () => {
    const html = '<p>Hello world</p>';
    const result = generateDiff(html, html);
    expect(result).to.equal('<div class="html-diff"><p>Hello world</p></div>');
  });

  it('wraps differences and includes <ins>/<del> markers', () => {
    const oldHtml = '<p>Hello</p>';
    const newHtml = '<p>Hello world</p>';
    const result = generateDiff(oldHtml, newHtml);
    expect(result).to.equal('<div class="html-diff"><p>Hello<ins class="diffins"> world</ins></p></div>');
  });

  it('accepts DocumentFragment inputs and trims empty leading/trailing paragraphs', () => {
    const template = '<p></p><p>Hello</p><p></p>';

    const range = document.createRange();
    const fragmentA = range.createContextualFragment(template);
    const fragmentB = range.createContextualFragment(template);

    const result = generateDiff(fragmentA, fragmentB);
    expect(result).to.equal('<div class="html-diff"><p>Hello</p></div>');
  });
});
