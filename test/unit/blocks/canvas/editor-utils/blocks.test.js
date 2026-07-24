import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import {
  getContentItemRange,
  deleteContentItem,
  moveContentItem,
  moveBlockToContentItem,
  moveBlockToSection,
  moveBlock,
} from '../../../../../blocks/canvas/editor-utils/blocks.js';
import { makeView, makeRealView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getInstrumentedHTML;
let parseSections;

before(async () => {
  ({ getInstrumentedHTML, parseSections } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
});

// Real pipeline, not a hand-picked node position — that mismatch is what masked the bug.
function childrenOf(view) {
  const html = getInstrumentedHTML(view);
  const sections = parseSections(html);
  return sections.flatMap((section) => section.items.flatMap((item) => item.children ?? []));
}

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
  const cases = [
    ['paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Para text' }] }, 'paragraph', 'Para text'],
    ['heading', { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading text' }] }, 'heading', 'Heading text'],
    ['code block', { type: 'code_block', content: [{ type: 'text', text: 'const x = 1;' }] }, 'code_block', 'const x = 1;'],
    ['quote', { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Some wisdom' }] }] }, 'blockquote', 'Some wisdom'],
    ['multi-item list', {
      type: 'bullet_list',
      content: [
        { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
        { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
      ],
    }, 'bullet_list', 'OneTwo'],
  ];

  cases.forEach(([label, nodeJSON, expectedType, expectedText]) => {
    it(`resolves a ${label} child to its whole node, not an inner fragment`, () => {
      const view = makeRealView({ type: 'doc', content: [nodeJSON] });
      const [child] = childrenOf(view);
      const range = getContentItemRange(view.state.doc, child);
      expect(range.pos).to.equal(0);
      expect(range.node.type.name).to.equal(expectedType);
      expect(range.node.textContent).to.equal(expectedText);
    });
  });

  it('resolves an image child to its wrapping <p>, not just the inline image node', () => {
    const view = makeRealView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'x.png' } }] }],
    });
    const [child] = childrenOf(view);
    const range = getContentItemRange(view.state.doc, child);
    expect(range.pos).to.equal(0);
    expect(range.node.type.name).to.equal('paragraph');
  });
});

describe('deleteContentItem', () => {
  it('removes a paragraph child entirely', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Delete me' }] },
      ],
    });
    const child = childrenOf(view).find((c) => c.innerText === 'Delete me');
    deleteContentItem(view, child);

    expect(view.state.doc.childCount).to.equal(1);
    expect(view.state.doc.firstChild.textContent).to.equal('Keep me');
  });

  it('removes the whole code block, not just its text', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'code_block', content: [{ type: 'text', text: 'const x = 1;' }] },
      ],
    });
    const child = childrenOf(view).find((c) => c.kind === 'code');
    deleteContentItem(view, child);

    expect(view.state.doc.childCount).to.equal(1);
    expect(view.state.doc.firstChild.textContent).to.equal('Keep me');
  });

  it('removes the whole blockquote, not just its inner paragraph text', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wisdom' }] }] },
      ],
    });
    const child = childrenOf(view).find((c) => c.kind === 'quote');
    deleteContentItem(view, child);

    expect(view.state.doc.childCount).to.equal(1);
    expect(view.state.doc.firstChild.textContent).to.equal('Keep me');
  });

  it('removes the whole wrapping <p> for an image child — no orphaned empty paragraph', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'x.png' } }] },
      ],
    });
    const child = childrenOf(view).find((c) => c.kind === 'image');
    deleteContentItem(view, child);

    expect(view.state.doc.childCount).to.equal(1);
    expect(view.state.doc.firstChild.textContent).to.equal('Keep me');
  });
});

describe('moveContentItem', () => {
  it('moves a whole code block relative to another content child (content target)', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'code_block', content: [{ type: 'text', text: 'const x = 1;' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const [codeChild, paraChild] = childrenOf(view);

    moveContentItem(view, codeChild, { type: 'content', child: paraChild }, 'after');

    const { doc } = view.state;
    expect(docTypes(doc)).to.deep.equal(['paragraph', 'code_block']);
    expect(doc.lastChild.textContent).to.equal('const x = 1;');
  });

  it('moves a whole quote before a block without merging into it (block target)', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        tableJSON('hero'),
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wisdom' }] }] },
      ],
    });
    const child = childrenOf(view).find((c) => c.kind === 'quote');

    moveContentItem(view, child, { type: 'block', blockIndex: 0 }, 'before');

    const { doc } = view.state;
    expect(docTypes(doc)).to.deep.equal(['blockquote', 'table']);
    expect(doc.firstChild.textContent).to.equal('Wisdom');
  });

  it('moves a whole multi-item list into a section with no default content yet (section target)', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
          ],
        },
        { type: 'horizontal_rule' },
        tableJSON('hero'),
      ],
    });
    const child = childrenOf(view).find((c) => c.kind === 'list');

    moveContentItem(view, child, { type: 'section', sectionIndex: 1 }, 'after');

    const { doc } = view.state;
    expect(docTypes(doc)).to.deep.equal(['horizontal_rule', 'bullet_list', 'table']);
    expect(doc.child(1).textContent).to.equal('OneTwo');
  });

  it('lands right before a section header — last item of the previous section', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const child = childrenOf(view).find((c) => c.innerText === 'B');

    moveContentItem(view, child, { type: 'section', sectionIndex: 1 }, 'before');

    const { doc } = view.state;
    expect(docTypes(doc)).to.deep.equal(['paragraph', 'paragraph', 'horizontal_rule']);
    expect(doc.child(1).textContent).to.equal('B');
  });

  it('does not dispatch when the drop position is a no-op', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const [a, b] = childrenOf(view);
    const before = view.state;

    moveContentItem(view, a, { type: 'content', child: b }, 'before');

    expect(view.state).to.equal(before);
  });
});

describe('moveBlockToContentItem', () => {
  it('moves a block before a content child, landing as a sibling in doc order', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Loose para' }] },
        tableJSON('hero'),
      ],
    });
    const child = childrenOf(view).find((c) => c.innerText === 'Loose para');

    moveBlockToContentItem(view, 0, child, 'before');

    const { doc } = view.state;
    expect(docTypes(doc)).to.deep.equal(['table', 'paragraph']);
    expect(doc.firstChild.firstChild.firstChild.textContent).to.equal('hero');
  });

  it('moves a block after a content child', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        tableJSON('hero'),
        { type: 'paragraph', content: [{ type: 'text', text: 'Loose para' }] },
      ],
    });
    const child = childrenOf(view).find((c) => c.innerText === 'Loose para');

    moveBlockToContentItem(view, 0, child, 'after');

    const { doc } = view.state;
    expect(docTypes(doc)).to.deep.equal(['paragraph', 'table']);
  });
});

describe('moveBlockToSection', () => {
  it('moves a block into a section that has no blocks (including a wholly empty one)', () => {
    const view = makeRealView({
      type: 'doc',
      content: [{ type: 'horizontal_rule' }, tableJSON('hero')],
    });

    moveBlockToSection(view, 0, 0, 'after');

    expect(docTypes(view.state.doc)).to.deep.equal(['table', 'horizontal_rule']);
  });

  it('lands right before a section header — last item of the previous section', () => {
    const view = makeRealView({
      type: 'doc',
      content: [tableJSON('hero'), { type: 'horizontal_rule' }, tableJSON('cards')],
    });

    moveBlockToSection(view, 1, 1, 'before');

    const { doc } = view.state;
    expect(docTypes(doc)).to.deep.equal(['table', 'table', 'horizontal_rule']);
    const names = [];
    doc.descendants((n) => {
      if (n.type.name === 'table') names.push(n.firstChild.firstChild.textContent);
    });
    expect(names).to.deep.equal(['hero', 'cards']);
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
