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
          { kind: 'object', pointer: '/data/cards/0', label: 'Card', children: [] },
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

const labels = (outline) => [...outline.shadowRoot.querySelectorAll('.label')];
const label = (outline, pointer) => outline.shadowRoot.querySelector(`.label[data-pointer="${pointer}"]`);
const toggle = (outline, pointer) => label(outline, pointer).closest('.row').querySelector('.toggle');
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

  it('lists every group and array item in editor order', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    expect(pointers(outline)).to.deep.equal([
      '/data', '/data/hero', '/data/cards', '/data/cards/0', '/data/cards/1', '/data/tags',
    ]);
    expect(label(outline, '/data/cards/1').textContent.trim()).to.equal('#2Card');
  });

  it('marks the root and its groups as sections', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();
    const sections = labels(outline).filter((button) => button.closest('.row.section'));

    expect(sections.map((button) => button.dataset.pointer)).to.deep.equal([
      '/data', '/data/hero', '/data/cards', '/data/tags',
    ]);
  });

  it('asks the editor to reveal a group on click', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();
    const jumps = [];
    const unsubscribe = formEvents.jumpRequest.subscribe(({ pointer }) => jumps.push(pointer));

    label(outline, '/data/cards/0').click();
    unsubscribe();

    expect(jumps).to.deep.equal(['/data/cards/0']);
  });

  it('marks the row of the current selection', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    formEvents.selectionState.emit({ pointer: '/data/cards/1', origin: NAV_ORIGIN.EDITOR, seq: 1 });
    await outline.updateComplete;

    expect(label(outline, '/data/cards/1').getAttribute('aria-current')).to.equal('location');
    expect(outline.shadowRoot.querySelectorAll('[aria-current]').length).to.equal(1);
  });

  it('collapses and expands a section', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    toggle(outline, '/data/cards').click();
    await outline.updateComplete;

    expect(pointers(outline)).to.not.include('/data/cards/0');
    expect(toggle(outline, '/data/cards').getAttribute('aria-expanded')).to.equal('false');

    toggle(outline, '/data/cards').click();
    await outline.updateComplete;

    expect(pointers(outline)).to.include('/data/cards/0');
  });

  it('offers no toggle for sections without nested groups', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    expect(toggle(outline, '/data/hero')).to.equal(null);
    expect(toggle(outline, '/data')).to.equal(null);
  });

  it('opens the section of a selection made in the editor', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();
    toggle(outline, '/data/cards').click();
    await outline.updateComplete;

    formEvents.selectionState.emit({ pointer: '/data/cards/1', origin: NAV_ORIGIN.EDITOR, seq: 1 });
    await outline.updateComplete;

    expect(label(outline, '/data/cards/1').getAttribute('aria-current')).to.equal('location');
  });

  it('clears when the document closes', async () => {
    formEvents.formState.emit({ model: { root: sampleRoot() } });
    const outline = await mountOutline();

    formEvents.formState.emit(null);
    await outline.updateComplete;

    expect(outline.shadowRoot.querySelector('.placeholder')).to.exist;
  });
});
