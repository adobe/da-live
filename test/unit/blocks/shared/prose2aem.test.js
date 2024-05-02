import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';

import prose2aem from '../../../../blocks/shared/prose2aem.js';

document.body.innerHTML = await readFile({ path: './mocks/prose2aem.html' });

describe('aem2prose', () => {
  before('parse everything', () => {
    document.body.outerHTML = prose2aem(document.body, true);
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

  it('Hides deleted regional edit content', () => {
    const deletedRegionalEdit = document.getElementById('deleted-regionaledit');
    expect(getComputedStyle(deletedRegionalEdit).display).to.equal('none');
  });
});
