import { expect } from '@esm-bundle/chai';
import {
  getCurrentLocNodePair,
  handleDeleteSingleNode,
  handleKeepSingleNode,
  handleKeepDeleted,
  handleKeepAdded,
  handleKeepBoth,
} from '../../../../../../blocks/edit/prose/diff/diff-actions.js';

describe('diff-actions getCurrentLocNodePair', () => {
  function buildContext({ pos, parent, nodeSize = 4 }) {
    const view = { state: { doc: { resolve: () => ({ parent, index: () => parent.indexAt }) } } };
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
    const { view, getPos, isValidPosition, isLocNode, canFormLocPair } = ctx;
    const result = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
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
    const { view, getPos, isValidPosition, isLocNode, canFormLocPair } = ctx;
    const result = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
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
    const { view, getPos, isValidPosition, isLocNode, canFormLocPair } = ctx;
    const result = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
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
    const { view, getPos, isValidPosition, isLocNode, canFormLocPair } = ctx;
    const result = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
    expect(result).to.deep.equal({
      addedPos: 10,
      deletedPos: 14,
      addedNode,
      deletedNode,
    });
  });

  it('Returns null on resolve errors (caught)', () => {
    const view = { state: { doc: { resolve: () => { throw new Error('boom'); } } } };
    const result = getCurrentLocNodePair(view, () => 0, () => true, () => true, () => true);
    expect(result).to.equal(null);
  });
});

describe('diff-actions handleDeleteSingleNode', () => {
  it('Logs and returns when getPos is invalid', async () => {
    let dispatched = false;
    const view = {
      state: {
        tr: { delete: () => { dispatched = true; } },
        doc: { resolve: () => null },
      },
      dispatch: () => {},
    };
    const isValid = (p) => p !== null && p !== undefined;
    await handleDeleteSingleNode(view, () => null, isValid, () => true);
    expect(dispatched).to.be.false;
  });

  it('Returns when current node is not a loc node', async () => {
    let dispatched = false;
    const node = { type: { name: 'paragraph' }, nodeSize: 1 };
    const view = {
      state: {
        tr: {
          delete: () => {
            dispatched = true;
            return {};
          },
        },
        doc: { nodeAt: () => node },
      },
      dispatch: () => { dispatched = true; },
    };
    await handleDeleteSingleNode(view, () => 0, (p) => p !== null && p !== undefined, () => false);
    expect(dispatched).to.be.false;
  });
});

describe('diff-actions handleKeepSingleNode', () => {
  it('Returns early when position is invalid', async () => {
    let called = false;
    await handleKeepSingleNode(
      { state: { tr: {}, doc: { resolve: () => null } }, dispatch: () => { called = true; } },
      () => null,
      (p) => p !== null && p !== undefined,
      () => true,
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
          doc: {
            resolve: () => ({
              index: () => 0,
              parent: {
                type: { name: 'doc' },
                child: () => ({ type: { name: 'paragraph' } }),
                childCount: 0,
              },
            }),
          },
        },
        dispatch: () => {},
      },
      getPos: () => 0,
      isValidPosition: (p) => p !== null && p !== undefined,
      isLocNode: () => false,
      canFormLocPair: () => true,
    };
    await handleKeepDeleted(ctx);
    await handleKeepAdded(ctx);
    await handleKeepBoth(ctx);
    // No exceptions; warn-only paths covered
  });
});
