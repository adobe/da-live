import { expect } from '@esm-bundle/chai';

import {
  findBlockContext,
  getBlockName,
  createImageNode,
  insertFragment,
} from '../../../../../blocks/edit/da-assets/helpers/insert.js';

// ---------------------------------------------------------------------------
// Mock ProseMirror view/state helpers
// ---------------------------------------------------------------------------

function makeSchema(nodes) {
  return { nodes };
}

function makeTableNode(cellText) {
  return {
    type: 'table',
    firstChild: { firstChild: { textContent: cellText } },
  };
}

function makeView(ancestorNodes = []) {
  const schema = makeSchema({
    table: 'table',
    image: { create: (attrs) => ({ type: 'image', attrs }) },
  });

  const depths = ancestorNodes.length;
  const $from = {
    depth: depths,
    node: (depth) => ancestorNodes[depths - depth],
  };

  const dispatched = [];
  return {
    dispatched,
    state: {
      schema,
      selection: { $from, from: 0 },
      tr: {
        replaceSelectionWith: (node) => ({ scrollIntoView: () => ({ node }) }),
        insert: () => ({ deleteSelection: () => ({ scrollIntoView: () => ({}) }) }),
      },
    },
    dispatch: (t) => dispatched.push(t),
  };
}

// ---------------------------------------------------------------------------
// findBlockContext
// ---------------------------------------------------------------------------

describe('findBlockContext', () => {
  it('returns null when cursor is not inside a table', () => {
    const view = makeView([{ type: 'doc' }, { type: 'paragraph' }]);
    const result = findBlockContext(view);
    expect(result).to.be.null;
  });

  it('returns the table node when cursor is inside a table', () => {
    const tableNode = makeTableNode('Hero');
    tableNode.type = 'table';
    const view = makeView([{ type: 'doc' }, tableNode, { type: 'table_row' }]);
    const result = findBlockContext(view);
    expect(result).to.equal(tableNode);
  });
});

// ---------------------------------------------------------------------------
// getBlockName
// ---------------------------------------------------------------------------

describe('getBlockName', () => {
  it('returns null when not inside a block', () => {
    const view = makeView([{ type: 'doc' }, { type: 'paragraph' }]);
    expect(getBlockName(view)).to.be.null;
  });

  it('returns lowercase dashed block name from first cell text', () => {
    const tableNode = makeTableNode('Featured Cards');
    tableNode.type = 'table';
    const view = makeView([{ type: 'doc' }, tableNode, { type: 'table_row' }]);
    expect(getBlockName(view)).to.equal('featured-cards');
  });

  it('strips parenthetical variants from block name', () => {
    const tableNode = makeTableNode('Columns (3-up)');
    tableNode.type = 'table';
    const view = makeView([{ type: 'doc' }, tableNode, { type: 'table_row' }]);
    expect(getBlockName(view)).to.equal('columns');
  });
});

// ---------------------------------------------------------------------------
// createImageNode
// ---------------------------------------------------------------------------

describe('createImageNode', () => {
  it('creates an image node with src and default style', () => {
    const view = makeView();
    const node = createImageNode(view, 'https://example.com/img.jpg');
    expect(node.type).to.equal('image');
    expect(node.attrs.src).to.equal('https://example.com/img.jpg');
    expect(node.attrs.style).to.equal('width: 180px');
  });

  it('includes alt attribute when provided', () => {
    const view = makeView();
    const node = createImageNode(view, 'https://example.com/img.jpg', 'A description');
    expect(node.attrs.alt).to.equal('A description');
  });

  it('omits alt attribute when not provided', () => {
    const view = makeView();
    const node = createImageNode(view, 'https://example.com/img.jpg');
    expect(node.attrs.alt).to.be.undefined;
  });
});

// ---------------------------------------------------------------------------
// insertFragment
// ---------------------------------------------------------------------------

describe('insertFragment', () => {
  it('dispatches a transaction when inserting an empty fragment', () => {
    const view = makeView();
    // Fragment.fromArray([]) returns Fragment.empty — a valid ProseMirror Fragment
    insertFragment(view, []);
    expect(view.dispatched).to.have.length(1);
  });
});
