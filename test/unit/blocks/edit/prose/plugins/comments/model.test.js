import { expect } from '@esm-bundle/chai';
import {
  groupCommentsByThread,
  getRootComment,
  buildNewComment,
  createReply,
  markThreadResolved,
  markThreadUnresolved,
  buildThreadGroups,
} from '../../../../../../../blocks/edit/prose/plugins/comments/helpers/model.js';

function makeComment(overrides = {}) {
  return {
    id: 'c1',
    threadId: 't1',
    parentId: null,
    author: { id: 'u1', name: 'Alice', email: 'alice@test.com' },
    content: 'Hello',
    createdAt: 1000,
    updatedAt: 1000,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    reactions: {},
    ...overrides,
  };
}

describe('comment model', () => {
  describe('groupCommentsByThread', () => {
    it('groups comments by threadId', () => {
      const map = new Map([
        ['c1', makeComment({ id: 'c1', threadId: 't1' })],
        ['c2', makeComment({ id: 'c2', threadId: 't1', parentId: 'c1' })],
        ['c3', makeComment({ id: 'c3', threadId: 't2' })],
      ]);
      const result = groupCommentsByThread(map);
      expect(result.size).to.equal(2);
      expect(result.get('t1').length).to.equal(2);
      expect(result.get('t2').length).to.equal(1);
    });

    it('sorts comments within each thread by createdAt ascending', () => {
      const map = new Map([
        ['c2', makeComment({ id: 'c2', threadId: 't1', createdAt: 2000 })],
        ['c1', makeComment({ id: 'c1', threadId: 't1', createdAt: 1000 })],
      ]);
      const result = groupCommentsByThread(map);
      const [first, second] = result.get('t1');
      expect(first.id).to.equal('c1');
      expect(second.id).to.equal('c2');
    });

    it('skips comments with no threadId', () => {
      const map = new Map([
        ['c1', makeComment({ id: 'c1', threadId: 't1' })],
        ['c2', { id: 'c2' }],
      ]);
      const result = groupCommentsByThread(map);
      expect(result.size).to.equal(1);
    });

    it('returns empty map for empty input', () => {
      expect(groupCommentsByThread(new Map()).size).to.equal(0);
    });

    it('handles null input gracefully', () => {
      expect(groupCommentsByThread(null).size).to.equal(0);
    });
  });

  describe('getRootComment', () => {
    it('returns the comment with parentId null', () => {
      const root = makeComment({ id: 'c1', parentId: null });
      const reply = makeComment({ id: 'c2', parentId: 'c1' });
      expect(getRootComment([reply, root]).id).to.equal('c1');
    });

    it('falls back to first comment when no root found', () => {
      const reply1 = makeComment({ id: 'c1', parentId: 'x' });
      const reply2 = makeComment({ id: 'c2', parentId: 'x' });
      expect(getRootComment([reply1, reply2]).id).to.equal('c1');
    });
  });

  describe('buildNewComment', () => {
    const user = { id: 'u1', name: 'Alice', email: 'alice@test.com' };
    const selection = {
      selectedText: 'hello world',
      isImage: false,
      imageRef: null,
    };

    it('sets threadId equal to its own id', () => {
      const comment = buildNewComment({ selection, user, content: 'test' });
      expect(comment.threadId).to.equal(comment.id);
    });

    it('sets parentId to null', () => {
      const comment = buildNewComment({ selection, user, content: 'test' });
      expect(comment.parentId).to.be.null;
    });

    it('sets selectedText from selection', () => {
      const comment = buildNewComment({ selection, user, content: 'test' });
      expect(comment.selectedText).to.equal('hello world');
    });

    it('initializes reactions as empty object', () => {
      const comment = buildNewComment({ selection, user, content: 'test' });
      expect(comment.reactions).to.deep.equal({});
    });

    it('sets resolved to false', () => {
      const comment = buildNewComment({ selection, user, content: 'test' });
      expect(comment.resolved).to.be.false;
    });

    it('sets createdAt and updatedAt to the same timestamp', () => {
      const comment = buildNewComment({ selection, user, content: 'test' });
      expect(comment.createdAt).to.equal(comment.updatedAt);
    });
  });

  describe('createReply', () => {
    it('sets parentId to the parent comment id', () => {
      const parent = makeComment({ id: 'c1', threadId: 't1' });
      const user = { id: 'u2', name: 'Bob', email: '' };
      const reply = createReply({ parentComment: parent, author: user, content: 'reply' });
      expect(reply.parentId).to.equal('c1');
    });

    it('inherits threadId from parent', () => {
      const parent = makeComment({ id: 'c1', threadId: 't1' });
      const user = { id: 'u2', name: 'Bob', email: '' };
      const reply = createReply({ parentComment: parent, author: user, content: 'reply' });
      expect(reply.threadId).to.equal('t1');
    });

    it('initializes reactions as empty object', () => {
      const parent = makeComment({ id: 'c1', threadId: 't1' });
      const user = { id: 'u2', name: 'Bob', email: '' };
      const reply = createReply({ parentComment: parent, author: user, content: 'reply' });
      expect(reply.reactions).to.deep.equal({});
    });

    it('does not include resolution fields', () => {
      const parent = makeComment({ id: 'p1', threadId: 't1' });
      const reply = createReply({ parentComment: parent, author: { id: 'u2', name: 'Bob', email: '' }, content: 'reply' });
      expect(reply).to.not.have.property('resolved');
      expect(reply).to.not.have.property('resolvedBy');
      expect(reply).to.not.have.property('resolvedAt');
    });
  });

  describe('markThreadResolved', () => {
    it('sets resolved to true with resolver info', () => {
      const root = makeComment({ id: 'c1' });
      const resolver = { id: 'u1', name: 'Alice' };
      const resolved = markThreadResolved({ rootComment: root, resolver });
      expect(resolved.resolved).to.be.true;
      expect(resolved.resolvedBy).to.deep.equal({ id: 'u1', name: 'Alice' });
      expect(resolved.resolvedAt).to.be.a('number');
    });

    it('clears reopened fields', () => {
      const root = makeComment({ reopenedBy: { id: 'u2', name: 'Bob' }, reopenedAt: 500 });
      const resolved = markThreadResolved({ rootComment: root, resolver: { id: 'u1', name: 'Alice' } });
      expect(resolved.reopenedBy).to.be.null;
      expect(resolved.reopenedAt).to.be.null;
    });

    it('does not mutate the original comment', () => {
      const root = makeComment({ id: 'c1' });
      markThreadResolved({ rootComment: root, resolver: { id: 'u1', name: 'Alice' } });
      expect(root.resolved).to.be.false;
    });
  });

  describe('markThreadUnresolved', () => {
    it('clears resolved fields and sets reopener info', () => {
      const root = makeComment({
        resolved: true,
        resolvedBy: { id: 'u1', name: 'Alice' },
        resolvedAt: 999,
      });
      const reopener = { id: 'u2', name: 'Bob' };
      const unresolved = markThreadUnresolved({ rootComment: root, reopener });
      expect(unresolved.resolved).to.be.false;
      expect(unresolved.resolvedBy).to.be.null;
      expect(unresolved.resolvedAt).to.be.null;
      expect(unresolved.reopenedBy).to.deep.equal({ id: 'u2', name: 'Bob' });
      expect(unresolved.reopenedAt).to.be.a('number');
    });
  });

  describe('buildThreadGroups', () => {
    function makeThread(id, overrides = {}) {
      return [makeComment({ id, threadId: id, ...overrides })];
    }

    it('classifies a thread with a resolved position as active', () => {
      const threads = new Map([['t1', makeThread('t1')]]);
      const positionCache = new Map([['t1', { from: 1, to: 5 }]]);
      const result = buildThreadGroups({ threads, positionCache });
      expect(result.active).to.have.length(1);
      expect(result.detached).to.have.length(0);
      expect(result.resolved).to.have.length(0);
    });

    it('classifies a thread without a cache entry as detached', () => {
      const threads = new Map([['t1', makeThread('t1')]]);
      const result = buildThreadGroups({ threads, positionCache: new Map() });
      expect(result.detached).to.have.length(1);
      expect(result.detached[0].isDetached).to.be.true;
    });

    it('classifies a resolved thread as resolved regardless of cache', () => {
      const threads = new Map([['t1', makeThread('t1', { resolved: true })]]);
      const positionCache = new Map([['t1', { from: 1, to: 5 }]]);
      const result = buildThreadGroups({ threads, positionCache });
      expect(result.resolved).to.have.length(1);
      expect(result.active).to.have.length(0);
    });

    it('sorts groups by rootComment.createdAt descending', () => {
      const threads = new Map([
        ['t1', [makeComment({ id: 't1', threadId: 't1', createdAt: 1000 })]],
        ['t2', [makeComment({ id: 't2', threadId: 't2', createdAt: 2000 })]],
      ]);
      const result = buildThreadGroups({ threads, positionCache: new Map() });
      expect(result.detached[0].threadId).to.equal('t2');
      expect(result.detached[1].threadId).to.equal('t1');
    });
  });
});
