import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import {
  buildThreadGroups,
  findThreadIdForComment,
} from '../../../../../../blocks/edit/da-comments/helpers/thread-utils.js';

function makeYMap(entries) {
  const ydoc = new Y.Doc();
  const ymap = ydoc.getMap('comments');
  entries.forEach(([id, val]) => ymap.set(id, val));
  return ymap;
}

describe('buildThreadGroups', () => {
  it('groups active, detached, and resolved by createdAt', () => {
    const ymap = makeYMap([
      ['r1', { id: 'r1', threadId: 'r1', parentId: null, resolved: false, createdAt: 10 }],
      ['r2', { id: 'r2', threadId: 'r2', parentId: null, resolved: false, createdAt: 20 }],
      ['r3', { id: 'r3', threadId: 'r3', parentId: null, resolved: false, createdAt: 30 }],
      ['r4', {
        id: 'r4', threadId: 'r4', parentId: null, resolved: true, resolvedAt: 100, createdAt: 5,
      }],
      ['rep1', { id: 'rep1', threadId: 'r1', parentId: 'r1', createdAt: 15, body: 'reply' }],
    ]);

    const attachedIds = new Set(['r1', 'r2']);
    const groups = buildThreadGroups({ ymap, attachedIds });

    expect(groups.active.map((t) => t.id)).to.deep.equal(['r2', 'r1']);
    const r1 = groups.active.find((t) => t.id === 'r1');
    expect(r1.replies).to.have.length(1);
    expect(r1.replies[0].id).to.equal('rep1');
    expect(groups.detached.map((t) => t.id)).to.deep.equal(['r3']);
    expect(groups.resolved.map((t) => t.id)).to.deep.equal(['r4']);
  });

  it('treats null attachedIds as "assume active" to avoid flash-to-detached on load', () => {
    const ymap = makeYMap([
      ['r1', { id: 'r1', threadId: 'r1', parentId: null, resolved: false, createdAt: 1 }],
      ['r2', {
        id: 'r2', threadId: 'r2', parentId: null, resolved: true, resolvedAt: 2, createdAt: 0,
      }],
    ]);

    const groups = buildThreadGroups({ ymap, attachedIds: null });
    expect(groups.active.map((t) => t.id)).to.deep.equal(['r1']);
    expect(groups.detached).to.be.empty;
    expect(groups.resolved.map((t) => t.id)).to.deep.equal(['r2']);
  });

  it('returns empty groups when ymap is falsy', () => {
    const groups = buildThreadGroups({ ymap: null, attachedIds: new Set() });
    expect(groups).to.deep.equal({ active: [], detached: [], resolved: [] });
  });
});

describe('findThreadIdForComment', () => {
  it('finds a root thread by its own id', () => {
    const ymap = makeYMap([
      ['t1', { id: 't1', threadId: 't1', parentId: null }],
    ]);
    expect(findThreadIdForComment({ ymap, commentId: 't1' })).to.equal('t1');
  });

  it('finds a thread id from a reply id', () => {
    const ymap = makeYMap([
      ['t1', { id: 't1', threadId: 't1', parentId: null }],
      ['r1', { id: 'r1', threadId: 't1', parentId: 't1' }],
    ]);
    expect(findThreadIdForComment({ ymap, commentId: 'r1' })).to.equal('t1');
  });

  it('returns null for unknown id', () => {
    const ymap = makeYMap([]);
    expect(findThreadIdForComment({ ymap, commentId: 'missing' })).to.be.null;
  });
});
