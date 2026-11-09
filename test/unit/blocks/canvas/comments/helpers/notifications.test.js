import { expect } from '@esm-bundle/chai';
import { commentRecipients, commentNotification, threadKey } from '../../../../../../blocks/canvas/comments/helpers/notifications.js';
import { createCommentsController } from '../../../../../../blocks/canvas/comments/helpers/controller.js';

const pat = { id: 'p', name: 'Pat Lee', email: 'pat@example.com' };
const sam = { id: 's', name: 'Sam Ortiz', email: 'Sam@example.com' };
const kim = { id: 'k', name: 'Kim Wu', email: 'kim@example.com' };

function memoryStore(initial = []) {
  const map = new Map(initial.map((c) => [c.id, c]));
  return {
    get size() { return map.size; },
    get: (id) => map.get(id),
    forEach: (fn) => map.forEach((value, id) => fn(value, id)),
    set: async (id, value) => { map.set(id, value); },
    delete: async (id) => { map.delete(id); },
    deleteInOrder: async (ids) => { ids.forEach((id) => map.delete(id)); },
    observe() {},
    unobserve() {},
  };
}

const settle = () => new Promise((resolve) => { setTimeout(resolve); });

describe('comment notifications', () => {
  describe('commentRecipients', () => {
    const store = memoryStore([
      { id: 't1', threadId: null, author: sam },
      { id: 'r1', threadId: 't1', author: kim },
      { id: 'x1', threadId: null, author: { email: 'other@example.com' } },
    ]);

    it('notifies new mentions and thread participants, never the actor', () => {
      const result = commentRecipients({ store, threadId: 't1', actor: pat, mentions: [kim, pat], includeParticipants: true });
      expect(result).to.deep.equal({ mentioned: ['kim@example.com'], participants: ['sam@example.com'] });
    });

    it('only notifies mentions added since the previous version', () => {
      const result = commentRecipients({ threadId: 't1', actor: pat, mentions: [kim, sam], previousMentions: [sam] });
      expect(result).to.deep.equal({ mentioned: ['kim@example.com'], participants: [] });
    });
  });

  it('builds a notification keyed by thread with a canvas deep link', () => {
    const notification = commentNotification({ path: 'acme/web/drafts/page', threadId: 't1', body: 'x'.repeat(200), type: 'comment-mention', recipients: ['kim@example.com'] });
    expect(notification.key).to.equal(threadKey('t1'));
    expect(notification.title).to.equal('page');
    expect(notification.link).to.equal('/canvas?comment=t1#/acme/web/drafts/page');
    expect(notification.description.length).to.equal(161);
  });

  describe('controller', () => {
    let originalFetch;
    let calls;

    beforeEach(() => {
      originalFetch = window.fetch;
      calls = [];
      window.fetch = (url, opts) => {
        const body = opts?.body ? JSON.parse(opts.body) : null;
        calls.push({ url: url.toString(), method: opts?.method, body });
        return Promise.resolve(new Response('{}', { status: 200 }));
      };
    });

    afterEach(() => {
      window.fetch = originalFetch;
    });

    const make = (store) => createCommentsController({ commentsStore: store, wsProvider: null, path: 'acme/web/page' });

    it('notifies participants and mentions on a reply', async () => {
      const store = memoryStore([{ id: 't1', threadId: null, author: sam }]);
      await make(store).createReply({ threadId: 't1', user: pat, body: 'hi @Kim Wu', mentions: [{ name: kim.name, email: kim.email }] });
      await settle();

      expect(calls.map((c) => [c.method, c.body.type, c.body.recipients])).to.deep.equal([
        ['POST', 'comment-reply', ['sam@example.com']],
        ['POST', 'comment-mention', ['kim@example.com']],
      ]);
      expect(calls[0].url).to.match(/\/notifications\/acme\/web\/page$/);
      expect(calls[0].body.key).to.equal('comment:t1');
    });

    it('sends nothing when a new thread mentions no one', async () => {
      await make(memoryStore()).createRootComment({ user: pat, anchor: {}, body: 'note' });
      await settle();
      expect(calls).to.deep.equal([]);
    });

    it('resolves the thread subject when a thread is resolved or deleted', async () => {
      const store = memoryStore([{ id: 't1', threadId: null, author: sam }, { id: 't2', threadId: null, author: sam }]);
      const controller = make(store);
      await controller.resolveThread({ threadId: 't1', user: pat });
      await controller.deleteComment({ commentId: 't2' });
      await settle();

      expect(calls.map((c) => [c.method, c.body.key])).to.deep.equal([
        ['DELETE', 'comment:t1'],
        ['DELETE', 'comment:t2'],
      ]);
    });

    it('does not resolve when only a reply is deleted', async () => {
      const store = memoryStore([{ id: 't1', threadId: null, author: sam }, { id: 'r1', threadId: 't1', author: kim }]);
      await make(store).deleteComment({ commentId: 'r1' });
      await settle();
      expect(calls).to.deep.equal([]);
    });
  });
});
