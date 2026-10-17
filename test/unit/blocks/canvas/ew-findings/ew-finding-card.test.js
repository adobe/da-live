import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { computePlacement, normalizeContext } = await import('../../../../../blocks/canvas/ew-findings/ew-finding-card.js');

const UNSAFE_HREF = ['javascript', 'alert(1)'].join(':');

const finding = {
  id: 'f1',
  title: 'Header copy',
  suggested: 'Use the brand voice',
  issue: 'Too generic',
  context: [
    { category: 'Guideline', description: 'Brand voice', href: 'https://example.com/voice' },
    { category: 'Unsafe', description: 'Nope', href: UNSAFE_HREF },
  ],
};

async function makeCard(props = {}) {
  const el = document.createElement('ew-finding-card');
  Object.assign(el, { finding, placement: 'center', ...props });
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const q = (el, sel) => el.shadowRoot.querySelector(sel);

describe('normalizeContext', () => {
  it('accepts object, array and strings, and drops unsafe links', () => {
    expect(normalizeContext(null)).to.deep.equal([]);
    expect(normalizeContext({ category: 'c', description: 'd', href: 'https://a.b' }))
      .to.deep.equal([{ category: 'c', description: 'd', href: 'https://a.b' }]);
    expect(normalizeContext(['plain'])).to.deep.equal([{ description: 'plain' }]);
    const [unsafe] = normalizeContext([{ description: 'x', href: UNSAFE_HREF }]);
    expect(unsafe.href).to.be.undefined;
  });
});

describe('computePlacement', () => {
  const bounds = { top: 0, left: 0, width: 1000, height: 800 };
  const card = { width: 360, height: 300 };

  it('prefers the right side of the element', () => {
    const anchor = { top: 100, left: 100, width: 200, height: 40 };
    const p = computePlacement({ anchor, card, bounds });
    expect(p).to.deep.equal({ side: 'right', left: 312, top: 100 });
  });

  it('flips left when there is no room on the right', () => {
    const anchor = { top: 100, left: 600, width: 380, height: 40 };
    const p = computePlacement({ anchor, card, bounds });
    expect(p.side).to.equal('left');
    expect(p.left).to.equal(600 - 12 - 360);
  });

  it('goes below a full-width element', () => {
    const anchor = { top: 100, left: 20, width: 960, height: 40 };
    const p = computePlacement({ anchor, card, bounds });
    expect(p.side).to.equal('below');
    expect(p.top).to.equal(152);
  });

  it('goes above when below does not fit', () => {
    const anchor = { top: 600, left: 20, width: 960, height: 40 };
    const p = computePlacement({ anchor, card, bounds });
    expect(p.side).to.equal('above');
    expect(p.top).to.equal(600 - 12 - 300);
  });

  it('clamps inside the bounds', () => {
    const p = computePlacement({
      anchor: { top: 790, left: 20, width: 960, height: 200 },
      card,
      bounds,
    });
    expect(p.side).to.equal('above');
    expect(p.top + card.height).to.be.at.most(800 - 8);
    const anchor2 = { top: -50, left: 100, width: 100, height: 40 };
    const q2 = computePlacement({ anchor: anchor2, card, bounds });
    expect(q2.top).to.equal(8);
  });
});

describe('ew-finding-card', () => {
  afterEach(() => document.querySelectorAll('ew-finding-card').forEach((el) => el.remove()));

  it('renders title, suggestion, issue, context and pager', async () => {
    const el = await makeCard({ index: 1, total: 3 });
    const dialog = q(el, '[role="dialog"]');
    expect(dialog.getAttribute('aria-labelledby')).to.equal('finding-title');
    expect(q(el, '#finding-title').textContent).to.equal('Header copy');
    expect(q(el, '.suggestion').textContent).to.include('Use the brand voice');
    expect(q(el, '.issue').textContent).to.include('Too generic');
    expect(q(el, '.pager').textContent).to.include('2 of 3 failures');
    expect(q(el, '.note')).to.be.null;
    const links = [...el.shadowRoot.querySelectorAll('.context a')];
    expect(links).to.have.lengthOf(1);
    expect(links[0].target).to.equal('_blank');
    expect(links[0].href).to.equal('https://example.com/voice');
    expect(el.shadowRoot.querySelectorAll('.context li')).to.have.lengthOf(2);
  });

  it('shows "quote → replacement" only when a replacement exists', async () => {
    const el = await makeCard({ quote: 'Old', replacement: 'New' });
    const change = q(el, '.change');
    expect(change.textContent).to.include('Old');
    expect(change.textContent).to.include('New');
    el.replacement = '';
    await el.updateComplete;
    expect(q(el, '.change')).to.be.null;
  });

  it('hides Apply for highlight-only evidence but keeps Add to chat', async () => {
    const el = await makeCard({ highlightOnly: true });
    expect(q(el, '.apply')).to.be.null;
    expect(q(el, '.add')).to.exist;
    el.highlightOnly = false;
    await el.updateComplete;
    expect(q(el, '.apply')).to.exist;
  });

  it('shows the not-located note and a backdrop for the unresolved dialog', async () => {
    const el = await makeCard({ unresolved: true });
    expect(q(el, '.note').textContent).to.include("Couldn't locate this on the page.");
    expect(q(el, '.backdrop')).to.exist;
  });

  it('single failure disables both pager buttons', async () => {
    const el = await makeCard({ index: 0, total: 1 });
    expect(q(el, '.pager').textContent).to.include('1 of 1 failure');
    const [prev, next] = el.shadowRoot.querySelectorAll('.step');
    expect(prev.disabled).to.be.true;
    expect(next.disabled).to.be.true;
  });

  it('emits events for the buttons', async () => {
    const el = await makeCard({ index: 1, total: 3 });
    const seen = [];
    ['finding-close', 'finding-apply', 'finding-add-to-chat', 'finding-step'].forEach((n) => {
      el.addEventListener(n, (e) => seen.push([n, e.detail]));
    });
    q(el, '.add').click();
    q(el, '.apply').click();
    q(el, '.close').click();
    const [prev, next] = el.shadowRoot.querySelectorAll('.step');
    prev.click();
    next.click();
    expect(seen).to.deep.equal([
      ['finding-add-to-chat', null],
      ['finding-apply', null],
      ['finding-close', null],
      ['finding-step', { delta: -1 }],
      ['finding-step', { delta: 1 }],
    ]);
  });

  it('closes on Escape inside the card', async () => {
    const el = await makeCard();
    let closed = 0;
    el.addEventListener('finding-close', () => { closed += 1; });
    q(el, '.card').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(closed).to.equal(1);
  });

  it('focusCard focuses the dialog', async () => {
    const el = await makeCard();
    el.focusCard();
    expect(el.shadowRoot.activeElement).to.equal(q(el, '.card'));
  });

  it('positions itself next to the anchor rect', async () => {
    const el = await makeCard({
      placement: 'anchored',
      anchorRect: { top: 100, left: 50, width: 200, height: 40 },
      bounds: { top: 0, left: 0, width: 1400, height: 900 },
    });
    expect(el.getAttribute('data-side')).to.equal('right');
    expect(el.style.left).to.equal('262px');
    expect(el.style.top).to.equal('100px');
  });

  it('is hidden while pending', async () => {
    const el = await makeCard({ pending: true });
    // Styles are stubbed in tests (loadStyle fixture); :host([pending]) hides it in the real CSS.
    expect(el.hasAttribute('pending')).to.equal(true);
  });
});
