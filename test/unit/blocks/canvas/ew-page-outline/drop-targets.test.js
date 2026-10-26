import { expect } from '@esm-bundle/chai';
import { getDropTargets } from '../../../../../blocks/canvas/ew-page-outline/drop-targets.js';

const para = (proseIndex, text) => ({ type: 'content', kind: 'paragraph', proseIndex, innerText: text, snippet: text });
const group = (...children) => ({ type: 'content', proseIndex: children[0].proseIndex, children });
const block = (blockIndex, name) => ({ type: 'block', blockIndex, name });

const p1 = para(1, 'one');
const p2 = para(5, 'two');
const p3 = para(20, 'three');

const sections = [
  { sectionIndex: 0, name: 'Hero', items: [block(0, 'hero'), group(p1, p2)] },
  { sectionIndex: 1, name: '', items: [] },
  { sectionIndex: 2, name: '', items: [group(p3), block(1, 'cards')] },
];

const descriptions = (result) => result.targets.map((t) => t.description);

describe('getDropTargets', () => {
  it('lists section gaps, skipping the two around the dragged section', () => {
    const result = getDropTargets({ type: 'section', index: 1 }, sections);
    expect(result.targets.map((t) => t.target)).to.deep.equal([
      { sectionIndex: 0, dropPosition: 'before' },
      { sectionIndex: 2, dropPosition: 'after' },
    ]);
    expect(descriptions(result)).to.deep.equal(['Before Hero', 'After Section 3']);
    expect(result.origin).to.equal(1);
  });

  it('treats collapsed groups as one row for a block drag', () => {
    const result = getDropTargets({ type: 'block', index: 0 }, sections);
    expect(result.targets.map((t) => t.target)).to.deep.equal([
      { contentChild: p2, dropPosition: 'after' },
      { sectionIndex: 1, dropPosition: 'after' },
      { contentChild: p3, dropPosition: 'before' },
      { blockIndex: 1, dropPosition: 'before' },
      { blockIndex: 1, dropPosition: 'after' },
    ]);
    expect(descriptions(result)).to.deep.equal([
      'After Default content in Hero',
      'Start of Section 2',
      'Before Default content in Section 3',
      'Before cards block in Section 3',
      'After cards block in Section 3',
    ]);
    expect(result.origin).to.equal(0);
  });

  it('lists each gap between children of an expanded group', () => {
    const result = getDropTargets({ type: 'block', index: 1 }, sections, new Set([1]));
    expect(result.targets.slice(0, 4).map((t) => t.target)).to.deep.equal([
      { blockIndex: 0, dropPosition: 'before' },
      { contentChild: p1, dropPosition: 'before' },
      { contentChild: p2, dropPosition: 'before' },
      { contentChild: p2, dropPosition: 'after' },
    ]);
    expect(result.targets[result.targets.length - 1].target)
      .to.deep.equal({ contentChild: p3, dropPosition: 'before' });
    expect(result.origin).to.equal(result.targets.length);
  });

  it('skips the gaps on either side of a dragged content child', () => {
    const result = getDropTargets({ type: 'content', index: p1 }, sections, new Set([1]));
    expect(result.targets.slice(0, 2).map((t) => t.target)).to.deep.equal([
      { blockIndex: 0, dropPosition: 'before' },
      { contentChild: p2, dropPosition: 'after' },
    ]);
    expect(descriptions(result)[1]).to.equal('After Paragraph in Hero');
    expect(result.origin).to.equal(1);
  });
});
