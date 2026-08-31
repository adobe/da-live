import { createCommentsStore } from '../../comments/helpers/comments-store.js';
import { parseDeepLink } from '../../comments/helpers/deep-link.js';
import { createCommentsController } from '../../comments/helpers/controller.js';
import commentPlugin from '../../comments/comment-plugin.js';
import { setCommentsController, openCommentsPanel } from '../../editor-utils/comments-bridge.js';
import { commentMarkers, postCommentMarkers, postScrollToComment } from '../../ew-comments/iframe-bridge.js';
import { createCommentGutter } from './comment-gutter.js';
import { afterNextPaint } from './shadow-mount.js';

export function createCommentsStoreFor(session, ctx) {
  return session?.docId
    ? createCommentsStore({ docId: session.docId, owner: ctx.org, repo: ctx.repo })
    : null;
}

export function subscribeCommentIframeBridge({ controller, getView, getPort }) {
  if (!controller?.subscribe) return () => {};

  const visible = () => controller.panelOpen;

  const syncLayoutMarkers = () => {
    const port = getPort();
    const view = getView();
    if (!port || !view) return;
    const markers = visible() ? commentMarkers(view, controller) : [];
    postCommentMarkers(port, markers, controller);
  };

  const scrollToSelected = () => {
    const port = getPort();
    const view = getView();
    if (port && view && visible() && controller.selectedThreadId) {
      postScrollToComment(port, view, controller);
    }
  };

  const unsub = controller.subscribe(({ reason }) => {
    if (reason === 'selectedThreadId'
      && controller.selectedThreadId
      && !controller.panelOpen) {
      openCommentsPanel();
    }
    const port = getPort();
    const view = getView();
    if (!port || !view) return;
    if (reason === 'selectedThreadId') {
      scrollToSelected();
      syncLayoutMarkers();
    } else if (reason === 'counts' || reason === 'docChange' || reason === 'init'
      || reason === 'panelOpen') {
      syncLayoutMarkers();
    }
  });

  if (controller.selectedThreadId) {
    syncLayoutMarkers();
    scrollToSelected();
  }
  return unsub;
}

export function createEditorComments({ getView, getPort, getContainer }) {
  let store = null;
  let controller = null;
  let gutterOff = null;
  let bridgeOff = null;

  return {
    get controller() { return controller; },

    createPlugin(session, ctx, wsProvider) {
      store = createCommentsStoreFor(session, ctx);
      controller = createCommentsController({ commentsStore: store, wsProvider });
      return commentPlugin({ controller, store });
    },

    publish() {
      setCommentsController(controller);
      if (parseDeepLink(new URL(window.location.href)).commentId) openCommentsPanel();
    },

    loadStore(wsProvider) {
      if (!store) return;
      const doLoad = () => {
        store.load().catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[comments] store load failed', err);
        });
      };
      if (wsProvider.synced) {
        doLoad();
        return;
      }
      const onSynced = (isSynced) => {
        if (!isSynced) return;
        wsProvider.off('synced', onSynced);
        doLoad();
      };
      wsProvider.on('synced', onSynced);
    },

    setupGutter() {
      gutterOff?.();
      if (!controller) return;
      afterNextPaint(() => {
        gutterOff = createCommentGutter({ controller, getView, getContainer });
      });
    },

    setupIframeBridge() {
      bridgeOff?.();
      bridgeOff = subscribeCommentIframeBridge({ controller, getView, getPort });
    },

    teardown() {
      gutterOff?.();
      gutterOff = null;
      bridgeOff?.();
      bridgeOff = null;
      controller?.destroy();
      controller = null;
      store = null;
      setCommentsController(null);
    },
  };
}
