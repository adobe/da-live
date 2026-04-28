import { expect } from '@esm-bundle/chai';
import {
  stripDaDiffAddedAttrs,
  getPairRange,
  getCurrentLocNodePair,
  handleDeleteSingleNode,
  handleKeepSingleNode,
  handleKeepDeleted,
  handleKeepAdded,
  handleKeepBoth,
  applyKeepOperation,
  REJECTED_KEY,
  ACCEPTED_KEY,
} from '../../../../../../blocks/edit/prose/diff/diff-actions.js';

describe('diff-actions stripDaDiffAddedAttrs', () => {
  it('Strips daDiffAdded attribute from nodes that carry it', () => {
    const created = [];
    const node = {
      attrs: { daDiffAdded: '', other: 'x' },
      content: 'c',
      marks: ['m'],
      type: { create: (attrs, content, marks) => { created.push({ attrs, content, marks }); return { attrs }; } },
    };
    const result = stripDaDiffAddedAttrs([node]);
    expect(created).to.have.length(1);
    expect(created[0].attrs.daDiffAdded).to.equal(null);
    expect(created[0].attrs.other).to.equal('x');
    expect(result[0].attrs.other).to.equal('x');
  });

  it('Returns the node unchanged when it has no daDiffAdded attribute', () => {
    const node = {
      attrs: { other: 'x' },
      content: 'c',
      marks: [],
      type: { create: () => 'should-not-be-called' },
    };
    const result = stripDaDiffAddedAttrs([node]);
    expect(result[0]).to.equal(node);
  });

  it('Skips nodes without attrs', () => {
    const node = { content: 'c', marks: [], type: { create: () => 'no' } };
    const result = stripDaDiffAddedAttrs([node]);
    expect(result[0]).to.equal(node);
  });

  it('REJECTED_KEY and ACCEPTED_KEY constants are stable strings', () => {
    expect(REJECTED_KEY).to.equal('rejectedHashes');
    expect(ACCEPTED_KEY).to.equal('acceptedHashes');
  });
});

describe('diff-actions getPairRange', () => {
  it('Picks the lower start position and the higher end position', () => {
    const range = getPairRange({
      deletedPos: 10,
      addedPos: 20,
      deletedNode: { nodeSize: 5 },
      addedNode: { nodeSize: 7 },
    });
    expect(range).to.deep.equal({ startPos: 10, endPos: 27 });
  });

  it('Handles reversed order (added before deleted)', () => {
    const range = getPairRange({
      deletedPos: 30,
      addedPos: 10,
      deletedNode: { nodeSize: 5 },
      addedNode: { nodeSize: 4 },
    });
    expect(range).to.deep.equal({ startPos: 10, endPos: 35 });
  });
});

describe('diff-actions getCurrentLocNodePair', () => {
  function buildContext({ pos, parent, nodeSize = 4 }) {
    const view = {
      state: {
        doc: {
          resolve: () => ({ parent, index: () => parent.indexAt }),
        },
      },
    };
    const getPos = () => pos;
    const isValidPosition = (p) => p !== null && p !== undefined;
    const isLocNode = (n) => n?.type?.name === 'diff_deleted' || n?.type?.name === 'diff_added';
    const canFormLocPair = () => true;
    return {
      view, getPos, isValidPosition, isLocNode, canFormLocPair, nodeSize,
    };
  }

  it('Returns null when the resolved position is invalid', () => {
    const ctx = buildContext({
      pos: null,
      parent: { indexAt: 0, child: () => null, childCount: 0 },
    });
    const result = getCurrentLocNodePair(
      ctx.view, ctx.getPos, ctx.isValidPosition, ctx.isLocNode, ctx.canFormLocPair,
    );
    expect(result).to.equal(null);
  });

  it('Returns null when current node is not a loc node', () => {
    const ctx = buildContext({
      pos: 0,
      parent: {
        indexAt: 0,
        child: () => ({ type: { name: 'paragraph' } }),
        childCount: 2,
      },
    });
    const result = getCurrentLocNodePair(
      ctx.view, ctx.getPos, ctx.isValidPosition, ctx.isLocNode, ctx.canFormLocPair,
    );
    expect(result).to.equal(null);
  });

  it('Returns deleted/added shape when current is diff_deleted with a paired sibling', () => {
    const deletedNode = { type: { name: 'diff_deleted' }, nodeSize: 4 };
    const addedNode = { type: { name: 'diff_added' }, nodeSize: 5 };
    const parent = {
      indexAt: 0,
      child(i) { return i === 0 ? deletedNode : addedNode; },
      childCount: 2,
    };
    const ctx = buildContext({ pos: 10, parent });
    const result = getCurrentLocNodePair(
      ctx.view, ctx.getPos, ctx.isValidPosition, ctx.isLocNode, ctx.canFormLocPair,
    );
    expect(result).to.deep.equal({
      deletedPos: 10,
      addedPos: 14,
      deletedNode,
      addedNode,
    });
  });

  it('Reverses positions when current is diff_added followed by diff_deleted', () => {
    const addedNode = { type: { name: 'diff_added' }, nodeSize: 4 };
    const deletedNode = { type: { name: 'diff_deleted' }, nodeSize: 5 };
    const parent = {
      indexAt: 0,
      child(i) { return i === 0 ? addedNode : deletedNode; },
      childCount: 2,
    };
    const ctx = buildContext({ pos: 10, parent });
    const result = getCurrentLocNodePair(
      ctx.view, ctx.getPos, ctx.isValidPosition, ctx.isLocNode, ctx.canFormLocPair,
    );
    expect(result).to.deep.equal({
      addedPos: 10,
      deletedPos: 14,
      addedNode,
      deletedNode,
    });
  });

  it('Returns null on resolve errors (caught)', () => {
    const view = {
      state: {
        doc: {
          resolve: () => { throw new Error('boom'); },
        },
      },
    };
    const result = getCurrentLocNodePair(
      view, () => 0, () => true, () => true, () => true,
    );
    expect(result).to.equal(null);
  });
});

describe('diff-actions handleDeleteSingleNode', () => {
  it('Logs and returns when getPos is invalid', () => {
    let dispatched = false;
    const view = { state: { tr: { delete: () => { dispatched = true; } }, doc: { resolve: () => null } }, dispatch: () => {} };
    handleDeleteSingleNode(view, () => null, (p) => p !== null && p !== undefined, () => true);
    expect(dispatched).to.be.false;
  });

  it('Returns when current node is not a loc node', () => {
    let dispatched = false;
    const node = { type: { name: 'paragraph' }, nodeSize: 1 };
    const view = {
      state: {
        tr: { delete: () => { dispatched = true; return {}; } },
        doc: { resolve: () => ({ index: () => 0, parent: { type: { name: 'doc' }, child: () => node }, depth: 1, before: () => 0 }) },
      },
      dispatch: () => {},
    };
    handleDeleteSingleNode(view, () => 0, (p) => p !== null && p !== undefined, () => false);
    expect(dispatched).to.be.false;
  });
});

describe('diff-actions handleKeepSingleNode', () => {
  it('Returns early when position is invalid', () => {
    let called = false;
    const dispatchContentTransaction = () => { called = true; };
    handleKeepSingleNode(
      { state: { tr: {}, doc: { resolve: () => null } } },
      () => null,
      (p) => p !== null && p !== undefined,
      () => true,
      () => [],
      dispatchContentTransaction,
    );
    expect(called).to.be.false;
  });
});

describe('diff-actions handleKeepDeleted/Added/Both', () => {
  it('handleKeepDeleted/Added/Both warn and return when no pair', async () => {
    const ctx = {
      view: {
        state: {
          tr: {},
          doc: { resolve: () => ({ index: () => 0, parent: { type: { name: 'doc' }, child: () => ({ type: { name: 'paragraph' } }), childCount: 0 } }) },
        },
        dispatch: () => {},
      },
      getPos: () => 0,
      isValidPosition: (p) => p !== null && p !== undefined,
      isLocNode: () => false,
      canFormLocPair: () => true,
      filterNodeContent: () => [],
      dispatchContentTransaction: () => {},
    };
    await handleKeepDeleted(ctx);
    handleKeepAdded(ctx);
    handleKeepBoth(ctx);
    // No exceptions; warn-only paths covered
  });
});

describe('diff-actions applyKeepOperation', () => {
  it('Replaces with filtered content when non-empty', () => {
    const calls = [];
    const tr = {
      replace: (s, e, slice) => { calls.push({ op: 'replace', s, e, size: slice.size }); },
      delete: () => { calls.push({ op: 'delete' }); },
    };
    const node = { content: { content: [{ x: 1 }, { y: 2 }] }, nodeSize: 5 };
    applyKeepOperation(tr, node, 10, (arr) => arr);
    expect(calls.length).to.equal(1);
    expect(calls[0].op).to.equal('replace');
  });

  it('Deletes the range when filtered content is empty', () => {
    const calls = [];
    const tr = {
      replace: () => { calls.push({ op: 'replace' }); },
      delete: (s, e) => { calls.push({ op: 'delete', s, e }); },
    };
    const node = { content: { content: [{}] }, nodeSize: 4 };
    applyKeepOperation(tr, node, 5, () => []);
    expect(calls).to.deep.equal([{ op: 'delete', s: 5, e: 9 }]);
  });
});
