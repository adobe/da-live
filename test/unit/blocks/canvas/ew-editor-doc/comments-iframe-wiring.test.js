import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { subscribeCommentIframeBridge } = await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');

function fakeController() {
  let cb;
  return {
    selectedThreadId: null, // no selection → scroll path posts nothing
    getAttachedThreadIds: () => new Set(),
    getComment: () => undefined,
    subscribe(fn) {
      cb = fn;
      fn({ reason: 'init' });
      return () => { cb = null; };
    },
    emit(reason) { cb?.({ reason }); },
  };
}

describe('subscribeCommentIframeBridge', () => {
  it('pushes set-comment-markers on init and on counts', () => {
    const sent = [];
    const controller = fakeController();
    const off = subscribeCommentIframeBridge({
      controller,
      getView: () => ({}),
      getPort: () => ({ postMessage: (m) => sent.push(m.type) }),
    });
    // 'init' fired during subscribe → one markers push (empty set)
    controller.emit('counts');
    expect(sent.filter((t) => t === 'set-comment-markers')).to.have.lengthOf(2);
    off();
  });

  it('stops posting after unsubscribe', () => {
    const sent = [];
    const controller = fakeController();
    const off = subscribeCommentIframeBridge({
      controller,
      getView: () => ({}),
      getPort: () => ({ postMessage: (m) => sent.push(m.type) }),
    });
    off();
    controller.emit('counts');
    // only the 'init' push happened before off()
    expect(sent.filter((t) => t === 'set-comment-markers')).to.have.lengthOf(1);
  });

  it('no-ops when no port is available', () => {
    const controller = fakeController();
    const off = subscribeCommentIframeBridge({
      controller,
      getView: () => ({}),
      getPort: () => null,
    });
    controller.emit('counts');
    off();
    expect(true).to.equal(true);
  });
});
