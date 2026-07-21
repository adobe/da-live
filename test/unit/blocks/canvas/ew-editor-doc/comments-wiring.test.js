import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createCommentsStoreFor, publishCommentsController } = await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
const { getCommentsBridge, setCommentsController } = await import('../../../../../blocks/canvas/editor-utils/comments-bridge.js');

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

  it('publishCommentsController publishes to the bridge', () => {
    const wsProvider = { awareness: { getLocalState: () => null, on() {}, off() {} } };
    const controller = publishCommentsController(null, wsProvider);
    expect(getCommentsBridge().controller).to.equal(controller);
    controller.destroy();
  });
});
