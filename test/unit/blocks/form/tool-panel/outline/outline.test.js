import { expect } from '@esm-bundle/chai';
import '../../../../setup-nx.js';
import { NAV_ORIGIN, formEvents } from '../../../../../../blocks/form/events.js';
import '../../../../../../blocks/form/tool-panel/outline/outline.js';

const text = (pointer, label) => ({ kind: 'string', pointer, label, value: '' });

function sampleRoot() {
  return {
    kind: 'object',
    pointer: '/data',
    label: 'Data',
    children: [
      text('/data/title', 'Title'),
      {
        kind: 'object',
        pointer: '/data/hero',
        label: 'Hero',
        children: [text('/data/hero/heading', 'Heading')],
      },
      {
        kind: 'array',
        pointer: '/data/cards',
        label: 'Cards',
        items: [
          {
            kind: 'object',
            pointer: '/data/cards/0',
            label: 'Card',
            children: [{
              kind: 'array',
              pointer: '/data/cards/0/links',
              label: 'Links',
              items: [{ kind: 'object', pointer: '/data/cards/0/links/0', label: 'Link', children: [] }],
            }],
          },
          { kind: 'object', pointer: '/data/cards/1', label: 'Card', children: [] },
        ],
      },
      {
        kind: 'array',
        pointer: '/data/tags',
        label: 'Tags',
        items: [text('/data/tags/0', 'Tag')],
      },
    ],
  };
}

const mounted = [];

async function mountOutline() {
  const outline = document.createElement('ew-form-outline');
  document.body.append(outline);
  mounted.push(outline);
  await outline.updateComplete;
  return outline;
}

function longRoot() {
  const items = (pointer) => Array.from({ length: 20 }, (_, position) => ({ kind: 'object', pointer: `${pointer}/${position}`, label: 'Item', children: [] }));
  const section = (key) => ({ kind: 'array', pointer: `/data/${key}`, label: key, items: items(`/data/${key}`) });
  return { kind: 'object', pointer: '/data', label: 'Data', children: [section('first'), section('second'), section('third')] };
}

async function mountTallOutline() {
  formEvents.formState.emit({ model: { root: longRoot() } });
  const outline = await mountOutline();
  outline.style.height = '300px';
  await outline.updateComplete;
  return outline;
}

const labels = (outline) => [...outline.shadowRoot.querySelectorAll('.label')];
const label = (outline, pointer) => outline.shadowRoot.querySelector(`.label[data-pointer="${pointer}"]`);
const expanded = (outline, pointer) => label(outline, pointer).getAttribute('aria-expanded');
const pointers = (outline) => labels(outline).map((button) => button.dataset.pointer);

describe('ew-form-outline', () => {
  afterEach(() => {
    while (mounted.length) mounted.pop().remove();
    formEvents.formState.emit(null);
    formEvents.selectionState.emit(null);
  });

  it('shows a placeholder until a document is open', async () => {
    const outline = await mountOutline();

    expect(outline.shadowRoot.querySelector('.placeholder')).to.exist;
  });

  it('lists the groups down to the children of the sections in editor order', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    expect(pointers(outline)).to.deep.equal([
      '/data', '/data/hero', '/data/cards', '/data/cards/0', '/data/cards/1', '/data/tags',
    ]);
    expect(label(outline, '/data/cards/1').textContent.trim()).to.equal('#2Card');
  });

  it('shows the document as the title and its groups as sections', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();
    const sections = labels(outline).filter((button) => button.closest('.row.section'));

    expect(label(outline, '/data').closest('.title')).to.exist;
    expect(sections.map((button) => button.dataset.pointer)).to.deep.equal([
      '/data/hero', '/data/cards', '/data/tags',
    ]);
  });

  it('asks the editor to reveal a group on click', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();
    const jumps = [];
    const unsubscribe = formEvents.jumpRequest.subscribe(({ pointer }) => jumps.push(pointer));

    label(outline, '/data/cards/0').click();
    label(outline, '/data').click();
    unsubscribe();

    expect(jumps).to.deep.equal(['/data/cards/0', '/data']);
  });

  it('marks the row of the current selection', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    formEvents.selectionState.emit({ pointer: '/data/cards/1', origin: NAV_ORIGIN.EDITOR, seq: 1 });
    await outline.updateComplete;

    expect(label(outline, '/data/cards/1').getAttribute('aria-current')).to.equal('location');
    expect(outline.shadowRoot.querySelectorAll('[aria-current]').length).to.equal(1);
  });

  it('marks the line below the current row', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    formEvents.selectionState.emit({ pointer: '/data/cards', origin: NAV_ORIGIN.EDITOR, seq: 1 });
    await outline.updateComplete;
    const marked = outline.shadowRoot.querySelectorAll('.children.of-current');

    expect(marked.length).to.equal(1);
    expect(marked[0].previousElementSibling.querySelector('.label').dataset.pointer).to.equal('/data/cards');
  });

  it('collapses and expands a section on click', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    label(outline, '/data/cards').click();
    await outline.updateComplete;

    expect(pointers(outline)).to.not.include('/data/cards/0');
    expect(expanded(outline, '/data/cards')).to.equal('false');

    label(outline, '/data/cards').click();
    await outline.updateComplete;

    expect(pointers(outline)).to.include('/data/cards/0');
  });

  it('expands a collapsed group below the sections', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    expect(expanded(outline, '/data/cards/0')).to.equal('false');

    label(outline, '/data/cards/0').click();
    await outline.updateComplete;

    expect(pointers(outline)).to.include('/data/cards/0/links');
  });

  it('does not expand groups without nested groups or the title', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    expect(expanded(outline, '/data/hero')).to.equal(null);
    expect(expanded(outline, '/data/cards/1')).to.equal(null);
    expect(expanded(outline, '/data')).to.equal(null);
  });

  it('opens the section of a selection made in the editor', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();
    label(outline, '/data/cards').click();
    await outline.updateComplete;

    formEvents.selectionState.emit({ pointer: '/data/cards/1', origin: NAV_ORIGIN.EDITOR, seq: 1 });
    await outline.updateComplete;

    expect(label(outline, '/data/cards/1').getAttribute('aria-current')).to.equal('location');
  });

  it('opens only the path to the latest editor selection', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    formEvents.selectionState.emit({ pointer: '/data/cards/0/links/0', origin: NAV_ORIGIN.EDITOR, seq: 1 });
    await outline.updateComplete;

    expect(label(outline, '/data/cards/0/links/0').getAttribute('aria-current')).to.equal('location');

    formEvents.selectionState.emit({ pointer: '/data/hero', origin: NAV_ORIGIN.EDITOR, seq: 2 });
    await outline.updateComplete;

    expect(pointers(outline)).to.not.include('/data/cards/0/links');
  });

  it('keeps a group the user opened when the editor selects elsewhere', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();
    label(outline, '/data/cards/0').click();
    await outline.updateComplete;

    formEvents.selectionState.emit({ pointer: '/data/hero', origin: NAV_ORIGIN.EDITOR, seq: 1 });
    await outline.updateComplete;

    expect(pointers(outline)).to.include('/data/cards/0/links');
  });

  it('marks a collapsed group that hides the current row', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    formEvents.selectionState.emit({ pointer: '/data/cards/0/links/0', origin: NAV_ORIGIN.OUTLINE, seq: 1 });
    await outline.updateComplete;

    expect(label(outline, '/data/cards/0').closest('.row').classList.contains('hides-current')).to.be.true;
  });

  it('keeps a pinned section in place when it closes', async () => {
    const outline = await mountTallOutline();
    const list = outline.shadowRoot.querySelector('.sections');
    list.scrollTop = label(outline, '/data/second/5').closest('li').offsetTop;
    const before = label(outline, '/data/second').getBoundingClientRect().top;

    label(outline, '/data/second').click();
    await outline.updateComplete;

    expect(pointers(outline)).to.not.include('/data/second/0');
    expect(label(outline, '/data/second').getBoundingClientRect().top).to.be.closeTo(before, 1);
  });

  it('keeps the last section in place when it closes at the end of the list', async () => {
    const outline = await mountTallOutline();
    const list = outline.shadowRoot.querySelector('.sections');
    list.scrollTop = list.scrollHeight;
    const before = label(outline, '/data/third').getBoundingClientRect().top;

    label(outline, '/data/third').click();
    await outline.updateComplete;

    expect(label(outline, '/data/third').getBoundingClientRect().top).to.be.closeTo(before, 1);
  });

  it('clears when the document closes', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    formEvents.formState.emit(null);
    await outline.updateComplete;

    expect(outline.shadowRoot.querySelector('.placeholder')).to.exist;
  });
});
