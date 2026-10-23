import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createCommentsStoreFor, createEditorComments } = await import('../../../../../blocks/canvas/ew-editor-doc/utils/editor-comments.js');
const { setCommentsController } = await import('../../../../../blocks/canvas/editor-utils/comments-bridge.js');

describe('ew-editor-doc comments wiring', () => {
  afterEach(() => setCommentsController(null));

  it('createCommentsStoreFor returns null when docId is missing', () => {
    const ctx = { org: 'o', repo: 's', path: 'o/s/p' };
    expect(createCommentsStoreFor({ docId: null }, ctx)).to.equal(null);
  });

  it('createCommentsStoreFor returns a store when docId present', () => {
    const ctx = { org: 'o', repo: 's', path: 'o/s/p' };
    const store = createCommentsStoreFor({ docId: 'doc-1' }, ctx);
    expect(store).to.be.an('object');
    expect(store.size).to.equal(0);
  });

  it('loads offline comments without waiting for a websocket sync', async () => {
    const savedFetch = window.fetch;
    const calls = [];
    window.fetch = async (url) => {
      calls.push(url);
      return new Response('[]', { status: 200 });
    };
    const comments = createEditorComments({
      getView: () => null,
      getPort: () => null,
      getContainer: () => null,
    });
    try {
      comments.createPlugin(
        { docId: 'offline-doc' },
        { org: 'org', repo: 'site', path: 'org/site/page' },
        null,
      );
      await comments.loadStore({
        synced: false,
        on() { throw new Error('Offline comments must not wait for sync'); },
      }, { offline: true });
      expect(calls.some((url) => String(url).includes('/comments/'))).to.be.true;
    } finally {
      comments.teardown();
      window.fetch = savedFetch;
    }
  });
});
