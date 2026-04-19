import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import * as mutations from '../../../../../../blocks/edit/da-comments/helpers/comment-mutations.js';

describe('comment-mutations', () => {
  let ymap;
  beforeEach(() => { ymap = new Y.Doc().getMap('comments'); });

  it('creates a root comment with defaults', () => {
    const user = { id: 'u1', name: 'Alice', email: 'a@b' };
    const anchor = { anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi' };
    const id = mutations.createRootComment({ ymap, user, anchor, body: 'body' });
    const stored = ymap.get(id);
    expect(stored.threadId).to.equal(id);
    expect(stored.parentId).to.be.null;
    expect(stored.body).to.equal('body');
    expect(stored.resolved).to.be.false;
    expect(stored.reactions).to.deep.equal({});
    expect(stored.anchorFrom).to.deep.equal([1]);
    expect(stored.anchorTo).to.deep.equal([2]);
  });

  it('creates a reply with parentId set to threadId', () => {
    ymap.set('t1', { id: 't1', threadId: 't1', parentId: null });
    const id = mutations.createReply({ ymap, threadId: 't1', user: { id: 'u' }, body: 'r' });
    const stored = ymap.get(id);
    expect(stored.parentId).to.equal('t1');
    expect(stored.threadId).to.equal('t1');
  });

  it('updateBody marks the comment edited', () => {
    ymap.set('c', { id: 'c', body: 'old', edited: false });
    mutations.updateBody({ ymap, commentId: 'c', body: 'new', now: 999 });
    expect(ymap.get('c').body).to.equal('new');
    expect(ymap.get('c').edited).to.be.true;
    expect(ymap.get('c').editedAt).to.equal(999);
  });

  it('toggles resolved flag and records resolvedBy / reopenedBy', () => {
    ymap.set('t', { id: 't', parentId: null, resolved: false });

    mutations.resolveThread({ ymap, threadId: 't', user: { id: 'u1', name: 'Alice' } });
    let entry = ymap.get('t');
    expect(entry.resolved).to.be.true;
    expect(entry.resolvedBy).to.deep.equal({ id: 'u1', name: 'Alice' });
    expect(entry.reopenedBy).to.be.null;

    mutations.unresolveThread({ ymap, threadId: 't', user: { id: 'u2', name: 'Bob' } });
    entry = ymap.get('t');
    expect(entry.resolved).to.be.false;
    expect(entry.resolvedBy).to.be.null;
    expect(entry.reopenedBy).to.deep.equal({ id: 'u2', name: 'Bob' });
  });

  it('delete root comment cascades to replies', () => {
    ymap.set('r', { id: 'r', threadId: 'r', parentId: null });
    ymap.set('c1', { id: 'c1', threadId: 'r', parentId: 'r' });
    ymap.set('c2', { id: 'c2', threadId: 'r', parentId: 'r' });
    mutations.deleteComment({ ymap, commentId: 'r' });
    expect(ymap.size).to.equal(0);
  });

  it('delete reply does not cascade', () => {
    ymap.set('r', { id: 'r', threadId: 'r', parentId: null });
    ymap.set('c1', { id: 'c1', threadId: 'r', parentId: 'r' });
    mutations.deleteComment({ ymap, commentId: 'c1' });
    expect(ymap.has('r')).to.be.true;
    expect(ymap.has('c1')).to.be.false;
  });
});
