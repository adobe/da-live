/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let canvasBus;

before(async () => {
  await import('../../../../../blocks/canvas/ew-page-outline/ew-page-outline.js');
  ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
});

async function createOutline() {
  const el = document.createElement('ew-page-outline');
  el._checkBlockLibrary = async () => {};
  document.body.appendChild(el);
  await el.updateComplete;
  el._hashState = { org: 'org', site: 'site', path: 'page' };
  await el.updateComplete;
  return el;
}

describe('ew-page-outline — section selection', () => {
  let el;

  beforeEach(async () => {
    el = await createOutline();
    el._sections = [
      { sectionIndex: 0, blocks: [], items: [{ type: 'block', name: 'hero', blockIndex: 0 }] },
      { sectionIndex: 1, blocks: [], items: [{ type: 'block', name: 'columns', blockIndex: 1 }] },
    ];
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  it('emits editorSectionSelectState with source:outline and marks the header selected on click', async () => {
    let received;
    const unsub = canvasBus.editorSectionSelectState.subscribe((detail) => { received = detail; });
    const headers = el.shadowRoot.querySelectorAll('.section-header');
    headers[1].click();
    unsub();
    await el.updateComplete;

    expect(received).to.deep.equal({ sectionIndex: 1, source: 'outline' });
    expect(headers[1].classList.contains('selected')).to.be.true;
    expect(headers[1].getAttribute('aria-selected')).to.equal('true');
    expect(headers[0].classList.contains('selected')).to.be.false;
  });

  it('does not re-apply its own outline-sourced echo (no-op, ignored by source check)', async () => {
    const headers = el.shadowRoot.querySelectorAll('.section-header');
    headers[0].click();
    await el.updateComplete;
    expect(headers[0].classList.contains('selected')).to.be.true;

    canvasBus.editorSectionSelectState.emit({ sectionIndex: 1, source: 'layout' });
    await el.updateComplete;
    expect(headers[0].classList.contains('selected')).to.be.false;
    expect(headers[1].classList.contains('selected')).to.be.true;
  });

  it('marks the correct header selected on an incoming layout-source event', async () => {
    canvasBus.editorSectionSelectState.emit({ sectionIndex: 0, source: 'layout' });
    await el.updateComplete;

    const headers = el.shadowRoot.querySelectorAll('.section-header');
    expect(headers[0].classList.contains('selected')).to.be.true;
    expect(headers[1].classList.contains('selected')).to.be.false;
  });

  it('scrolls a section selected from layout into view', async () => {
    const header = el.shadowRoot.querySelectorAll('.section-header')[1];
    let scrolled;
    header.scrollIntoView = (opts) => { scrolled = opts; };
    canvasBus.editorSectionSelectState.emit({ sectionIndex: 1, source: 'layout' });
    await el.updateComplete;
    await el.updateComplete;
    expect(scrolled).to.deep.equal({ block: 'nearest' });
  });

  it('clears a previously selected section when a block is selected', async () => {
    const headers = el.shadowRoot.querySelectorAll('.section-header');
    headers[0].click();
    await el.updateComplete;
    expect(headers[0].classList.contains('selected')).to.be.true;

    el._select(1);
    await el.updateComplete;

    expect(headers[0].classList.contains('selected')).to.be.false;
    expect(el.shadowRoot.querySelector('[data-block-index="1"]').classList.contains('selected')).to.be.true;
  });

  it('clears a previously selected block when a section is selected', async () => {
    el._select(0);
    await el.updateComplete;
    const block = el.shadowRoot.querySelector('[data-block-index="0"]');
    expect(block.classList.contains('selected')).to.be.true;

    const headers = el.shadowRoot.querySelectorAll('.section-header');
    headers[1].click();
    await el.updateComplete;

    expect(block.classList.contains('selected')).to.be.false;
    expect(headers[1].classList.contains('selected')).to.be.true;
  });

  it('clears a selected section when an incoming block selection (doc source) arrives', async () => {
    const headers = el.shadowRoot.querySelectorAll('.section-header');
    headers[0].click();
    await el.updateComplete;
    expect(headers[0].classList.contains('selected')).to.be.true;

    canvasBus.editorSelectState.emit({ blockIndex: 1, source: 'doc' });
    await el.updateComplete;

    expect(headers[0].classList.contains('selected')).to.be.false;
  });
});
