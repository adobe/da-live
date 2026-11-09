import { expect } from '@esm-bundle/chai';
import { createCommentsController } from '../../../../../../blocks/canvas/comments/helpers/controller.js';

const store = (comments = []) => ({
  size: comments.length,
  forEach: (fn) => comments.forEach((c) => fn(c, c.id)),
  get: () => undefined,
  observe() {},
  unobserve() {},
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('comments roster', () => {
  let originalFetch;
  let calls;

  beforeEach(() => {
    originalFetch = window.fetch;
    calls = [];
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('loads members for the document and fills names from commenters', async () => {
    window.fetch = (url, opts) => {
      calls.push({ url: url.toString(), opts });
      return Promise.resolve(json(200, {
        members: [
          { email: 'pat@example.com', name: 'Pat Lee' },
          { email: 'sam@example.com', name: 'sam@example.com' },
        ],
        partial: false,
      }));
    };
    const controller = createCommentsController({
      commentsStore: store([{ id: 'c1', author: { name: 'Sam Ortiz', email: 'sam@example.com' } }]),
      wsProvider: null,
      path: 'aemsites/rbc/drafts/page',
    });

    const roster = await controller.loadRoster();

    expect(calls[0].url).to.match(/\/members\/aemsites\/rbc\/drafts\/page$/);
    expect(calls[0].opts.noRedirect).to.equal(true);
    expect(roster).to.deep.equal([
      { email: 'pat@example.com', name: 'Pat Lee' },
      { email: 'sam@example.com', name: 'Sam Ortiz' },
    ]);

    await controller.loadRoster();
    expect(calls).to.have.length(1);
  });

  it('returns no one when the members route fails', async () => {
    window.fetch = () => Promise.resolve(new Response('', { status: 500 }));
    const controller = createCommentsController({ commentsStore: store(), wsProvider: null, path: 'o/s/p' });
    expect(await controller.loadRoster()).to.deep.equal([]);
  });

  it('returns no one without a document path', async () => {
    const controller = createCommentsController({ commentsStore: store(), wsProvider: null });
    expect(await controller.loadRoster()).to.deep.equal([]);
  });
});
