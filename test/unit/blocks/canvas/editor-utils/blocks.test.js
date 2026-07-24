import { expect } from '@esm-bundle/chai';
import {
  getContentItemRange,
  deleteContentItem,
  moveContentItem,
  moveBlock,
} from '../../../../../blocks/canvas/editor-utils/blocks.js';
import { makeView, posOf } from '../test-helpers.js';

function docTypes(doc) {
  const types = [];
  doc.forEach((n) => types.push(n.type.name));
  return types;
}

function tableJSON(name, contentText = 'content') {
  const cell = (text) => ({
    type: 'table_cell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  return {
    type: 'table',
    content: [
      { type: 'table_row', content: [cell(name)] },
      { type: 'table_row', content: [cell(contentText)] },
    ],
  };
}

describe('getContentItemRange', () => {
  it('resolves a non-image child to its own node range', () => {
    const view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Para one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Para two' }] },
      ],
    });
    const { doc } = view.state;
    const pos = posOf(doc, (n) => n.textContent === 'Para one');
    const range = getContentItemRange(doc, { kind: 'paragraph', proseIndex: pos });
    expect(range.pos).to.equal(pos);
    expect(range.size).to.equal(doc.nodeAt(pos).nodeSize);
  });

  it('resolves an image child to its wrapping <p>, not just the inline image node', () => {
    const view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'x.png' } }] },
      ],
    });
    const { doc } = view.state;
    const wrapperPos = posOf(doc, (n) => n.type.name === 'paragraph' && n.textContent === '');
    const wrapper = doc.nodeAt(wrapperPos);
    const imagePos = wrapperPos + 1;

    const range = getContentItemRange(doc, { kind: 'image', proseIndex: imagePos });
    expect(range.pos).to.equal(wrapperPos);
    expect(range.size).to.equal(wrapper.nodeSize);
    expect(range.node.type.name).to.equal('paragraph');
  });
});

describe('deleteContentItem', () => {
  it('removes a paragraph child entirely', () => {
    const view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Delete me' }] },
      ],
    });
    const pos = posOf(view.state.doc, (n) => n.textContent === 'Delete me');
    deleteContentItem(view, { kind: 'paragraph', proseIndex: pos });

    const texts = [];
    view.state.doc.forEach((n) => texts.push(n.textContent));
    expect(texts).to.deep.equal(['Keep me']);
  });

  it('removes the whole wrapping <p> for an image child — no orphaned empty paragraph', () => {
    const view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'x.png' } }] },
      ],
    });
    const wrapperPos = posOf(view.state.doc, (n) => n.type.name === 'paragraph' && n.textContent === '');
    const imagePos = wrapperPos + 1;
    deleteContentItem(view, { kind: 'image', proseIndex: imagePos });

    expect(view.state.doc.childCount).to.equal(1);
    expect(view.state.doc.firstChild.textContent).to.equal('Keep me');
  });
});

describe('moveContentItem', () => {
  it('reorders a content child relative to another content child (content target)', () => {
    const view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const aPos = posOf(view.state.doc, (n) => n.textContent === 'A');
    const bPos = posOf(view.state.doc, (n) => n.textContent === 'B');

    moveContentItem(
      view,
      { kind: 'paragraph', proseIndex: aPos },
      { type: 'content', child: { kind: 'paragraph', proseIndex: bPos } },
      'after',
    );

    const texts = [];
    view.state.doc.forEach((n) => texts.push(n.textContent));
    expect(texts).to.deep.equal(['B', 'A']);
  });

  it('moves a content child before a block without merging into it (block target)', () => {
    const view = makeView({
      type: 'doc',
      content: [
        tableJSON('hero'),
        { type: 'paragraph', content: [{ type: 'text', text: 'Loose para' }] },
      ],
    });
    const paraPos = posOf(view.state.doc, (n) => n.type.name === 'paragraph');

    moveContentItem(
      view,
      { kind: 'paragraph', proseIndex: paraPos },
      { type: 'block', blockIndex: 0 },
      'before',
    );

    expect(docTypes(view.state.doc)).to.deep.equal(['paragraph', 'table']);
    expect(view.state.doc.firstChild.textContent).to.equal('Loose para');
  });

  it('moves a content child into a section with no default content yet (section target)', () => {
    const view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Move me' }] },
        { type: 'horizontal_rule' },
        tableJSON('hero'),
      ],
    });
    const paraPos = posOf(view.state.doc, (n) => n.type.name === 'paragraph');

    moveContentItem(
      view,
      { kind: 'paragraph', proseIndex: paraPos },
      { type: 'section', sectionIndex: 1 },
      'after',
    );

    expect(docTypes(view.state.doc)).to.deep.equal(['horizontal_rule', 'paragraph', 'table']);
  });

  it('lands right before a section header — last item of the previous section', () => {
    const view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const bPos = posOf(view.state.doc, (n) => n.textContent === 'B');

    moveContentItem(
      view,
      { kind: 'paragraph', proseIndex: bPos },
      { type: 'section', sectionIndex: 1 },
      'before',
    );

    expect(docTypes(view.state.doc)).to.deep.equal(['paragraph', 'paragraph', 'horizontal_rule']);
    expect(view.state.doc.child(1).textContent).to.equal('B');
  });

  it('does not dispatch when the drop position is a no-op', () => {
    const view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const aPos = posOf(view.state.doc, (n) => n.textContent === 'A');
    const bPos = posOf(view.state.doc, (n) => n.textContent === 'B');
    const before = view.state;

    moveContentItem(
      view,
      { kind: 'paragraph', proseIndex: aPos },
      { type: 'content', child: { kind: 'paragraph', proseIndex: bPos } },
      'before',
    );

    expect(view.state).to.equal(before);
  });
});

describe('moveBlock (regression coverage for the shared splice helper)', () => {
  it('reorders two blocks', () => {
    const view = makeView({
      type: 'doc',
      content: [tableJSON('hero'), tableJSON('cards')],
    });
    moveBlock(view, 0, 1, 'after');

    const names = [];
    view.state.doc.descendants((n) => {
      if (n.type.name === 'table') names.push(n.firstChild.firstChild.textContent);
    });
    expect(names).to.deep.equal(['cards', 'hero']);
  });

  it('drops a block before another one', () => {
    const view = makeView({
      type: 'doc',
      content: [tableJSON('hero'), tableJSON('cards'), tableJSON('columns')],
    });
    moveBlock(view, 2, 0, 'before');

    const names = [];
    view.state.doc.descendants((n) => {
      if (n.type.name === 'table') names.push(n.firstChild.firstChild.textContent);
    });
    expect(names).to.deep.equal(['columns', 'hero', 'cards']);
  });
});
