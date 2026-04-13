import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const { initCommentsStore } = await import('../../../../../../../blocks/edit/prose/plugins/comments/helpers/store.js');

function makeMap(initialEntries = []) {
  const data = new Map(initialEntries);
  const observers = new Set();
  return {
    get size() { return data.size; },
    set(key, value) { data.set(key, value); observers.forEach((obs) => obs()); },
    get(key) { return data.get(key); },
    delete(key) { data.delete(key); observers.forEach((obs) => obs()); },
    forEach(cb) { data.forEach(cb); },
    observe(listener) { observers.add(listener); },
    unobserve(listener) { observers.delete(listener); },
  };
}

const DOC_NAME = 'https://admin.da.live/source/org/repo/doc';
const DOC_ID = 'test-doc-id';
const user = { id: 'u1', name: 'Alice', email: 'alice@test.com' };
const selection = {
  selectedText: 'hello world',
  isImage: false,
  imageRef: null,
  from: 0,
  to: 11,
  selector: null,
};
const seed = ['__seed__', { id: '__seed__', threadId: '__seed__' }];

describe('comments store', () => {
  let orgFetch;

  before(() => {
    orgFetch = window.fetch;
    window.fetch = (url, opts = {}) => {
      if (opts?.method === 'PUT') return { ok: true };
      return { ok: false };
    };
  });

  after(() => {
    window.fetch = orgFetch;
  });

  describe('subscribe', () => {
    it('emits state synchronously on subscribe', () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      let callCount = 0;
      const unsub = store.subscribe(() => { callCount += 1; });
      expect(callCount).to.equal(1);
      unsub();
      store.destroy();
    });

    it('returns default empty thread groups before positions are set', () => {
      const store = initCommentsStore({ map: makeMap(), docName: DOC_NAME, docId: DOC_ID });
      let state;
      const unsub = store.subscribe((s) => { state = s; });
      expect(state.threadGroups.active).to.deep.equal([]);
      expect(state.threadGroups.detached).to.deep.equal([]);
      expect(state.threadGroups.resolved).to.deep.equal([]);
      unsub();
      store.destroy();
    });

    it('unsubscribes correctly — no further emissions after unsub', () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      let callCount = 0;
      const unsub = store.subscribe(() => { callCount += 1; });
      unsub();
      store.submitComment({ selection, user, content: 'test' });
      expect(callCount).to.equal(1);
      store.destroy();
    });
  });

  describe('submitComment', () => {
    it('persists comment to the map', () => {
      const map = makeMap([seed]);
      const store = initCommentsStore({ map, docName: DOC_NAME, docId: DOC_ID });
      const comment = store.submitComment({ selection, user, content: 'Hello' });
      expect(map.get(comment.id)).to.deep.equal(comment);
      store.destroy();
    });

    it('sets threadId equal to id (root comment)', () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      const comment = store.submitComment({ selection, user, content: 'Hello' });
      expect(comment.threadId).to.equal(comment.id);
      store.destroy();
    });
  });

  describe('submitReply', () => {
    it('creates a reply linked to the parent', () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      const root = store.submitComment({ selection, user, content: 'Root' });
      const reply = store.submitReply({ parentId: root.id, user, content: 'Reply' });
      expect(reply.parentId).to.equal(root.id);
      expect(reply.threadId).to.equal(root.threadId);
      store.destroy();
    });

    it('returns null for unknown parentId', () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      expect(store.submitReply({ parentId: 'nonexistent', user, content: 'x' })).to.be.null;
      store.destroy();
    });
  });

  describe('updateComment', () => {
    it('updates content and bumps updatedAt', async () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      const root = store.submitComment({ selection, user, content: 'Original' });
      await new Promise((r) => { setTimeout(r, 5); });
      const updated = store.updateComment({ commentId: root.id, changes: { content: 'Edited' } });
      expect(updated.content).to.equal('Edited');
      expect(updated.updatedAt).to.be.greaterThan(root.updatedAt);
      store.destroy();
    });

    it('ignores unknown change keys', () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      const root = store.submitComment({ selection, user, content: 'Original' });
      const result = store.updateComment({ commentId: root.id, changes: { unknown: 'x' } });
      expect(result.content).to.equal('Original');
      store.destroy();
    });

    it('returns null for unknown commentId', () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      expect(store.updateComment({ commentId: 'missing', changes: { content: 'x' } })).to.be.null;
      store.destroy();
    });
  });

  describe('resolveThread / unresolveThread', () => {
    it('marks the root comment resolved', () => {
      const map = makeMap([seed]);
      const store = initCommentsStore({ map, docName: DOC_NAME, docId: DOC_ID });
      const root = store.submitComment({ selection, user, content: 'Root' });
      store.resolveThread({ threadId: root.threadId, user });
      expect(map.get(root.id).resolved).to.be.true;
      store.destroy();
    });

    it('marks the root comment unresolved', () => {
      const map = makeMap([seed]);
      const store = initCommentsStore({ map, docName: DOC_NAME, docId: DOC_ID });
      const root = store.submitComment({ selection, user, content: 'Root' });
      store.resolveThread({ threadId: root.threadId, user });
      store.unresolveThread({ threadId: root.threadId, user });
      expect(map.get(root.id).resolved).to.be.false;
      store.destroy();
    });
  });

  describe('deleteComment', () => {
    it('deletes the entire thread when the root comment is deleted', () => {
      const map = makeMap([seed]);
      const store = initCommentsStore({ map, docName: DOC_NAME, docId: DOC_ID });
      const root = store.submitComment({ selection, user, content: 'Root' });
      const reply = store.submitReply({ parentId: root.id, user, content: 'Reply' });
      store.deleteComment(root.id);
      expect(map.get(root.id)).to.be.undefined;
      expect(map.get(reply.id)).to.be.undefined;
      store.destroy();
    });

    it('deletes only the reply when a reply is deleted', () => {
      const map = makeMap([seed]);
      const store = initCommentsStore({ map, docName: DOC_NAME, docId: DOC_ID });
      const root = store.submitComment({ selection, user, content: 'Root' });
      const reply = store.submitReply({ parentId: root.id, user, content: 'Reply' });
      store.deleteComment(reply.id);
      expect(map.get(root.id)).to.exist;
      expect(map.get(reply.id)).to.be.undefined;
      store.destroy();
    });
  });

  describe('sidecar write coalescing', () => {
    it('makes far fewer network writes than comment submits', async () => {
      let putCount = 0;
      const savedFetch = window.fetch;
      window.fetch = (url, opts = {}) => {
        if (opts?.method === 'PUT') {
          putCount += 1;
          return new Promise((r) => { setTimeout(() => r({ ok: true }), 80); });
        }
        return Promise.resolve({ ok: false });
      };
      try {
        await new Promise((r) => { setTimeout(r, 20); });
        putCount = 0;

        const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
        store.submitComment({ selection, user, content: 'A' });
        store.submitComment({ selection, user, content: 'B' });
        store.submitComment({ selection, user, content: 'C' });
        await new Promise((r) => { setTimeout(r, 500); });
        expect(putCount).to.be.at.most(2);
        store.destroy();
      } finally {
        window.fetch = savedFetch;
      }
    });

    it('does not write to network when docName is not a valid URL', async () => {
      let putCount = 0;
      const savedFetch = window.fetch;
      window.fetch = (url, opts = {}) => {
        if (opts?.method === 'PUT') putCount += 1;
        return { ok: true };
      };
      try {
        const store = initCommentsStore({ map: makeMap([seed]), docName: 'not-a-url', docId: DOC_ID });
        store.submitComment({ selection, user, content: 'test' });
        await new Promise((r) => { setTimeout(r, 100); });
        expect(putCount).to.equal(0);
        store.destroy();
      } finally {
        window.fetch = savedFetch;
      }
    });
  });

  describe('loadSidecar', () => {
    it('does not overwrite map data that arrived after fetch started', async () => {
      let resolveFetch;
      const savedFetch = window.fetch;
      window.fetch = () => new Promise((res) => { resolveFetch = res; });

      const map = makeMap();
      const whenSynced = Promise.resolve();
      initCommentsStore({ map, docName: DOC_NAME, docId: DOC_ID, whenSynced });

      await new Promise((r) => { setTimeout(r, 10); });

      map.set('live-comment', { id: 'live-comment', threadId: 'live-comment', content: 'live' });

      resolveFetch({
        ok: true,
        json: async () => (
          { comments: { 'stale-comment': { id: 'stale-comment', threadId: 'stale-comment', content: 'stale' } } }
        ),
      });

      await new Promise((r) => { setTimeout(r, 20); });

      expect(map.get('stale-comment')).to.be.undefined;
      expect(map.get('live-comment')).to.deep.include({ content: 'live' });

      window.fetch = savedFetch;
    });

    it('does not overwrite map data that arrived between the two await boundaries', async () => {
      let resolveJson;
      const savedFetch = window.fetch;
      window.fetch = async () => ({
        ok: true,
        json: () => new Promise((res) => { resolveJson = res; }),
      });

      const map = makeMap();
      const whenSynced = Promise.resolve();
      initCommentsStore({ map, docName: DOC_NAME, docId: DOC_ID, whenSynced });

      await new Promise((r) => { setTimeout(r, 5); });
      map.set('live-comment', { id: 'live-comment', threadId: 'live-comment', content: 'live' });

      resolveJson(
        { comments: { 'stale-comment': { id: 'stale-comment', threadId: 'stale-comment', content: 'stale' } } },
      );

      await new Promise((r) => { setTimeout(r, 20); });

      expect(map.get('stale-comment')).to.be.undefined;

      window.fetch = savedFetch;
    });
  });

  describe('destroy', () => {
    it('clears all listeners after destroy', () => {
      const store = initCommentsStore({ map: makeMap([seed]), docName: DOC_NAME, docId: DOC_ID });
      let callCount = 0;
      store.subscribe(() => { callCount += 1; });
      const countBefore = callCount;
      store.destroy();
      expect(callCount).to.equal(countBefore);
      store.destroy();
    });
  });
});
