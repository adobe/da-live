import { LitElement, html, nothing } from 'da-lit';
import { yUndo, yRedo, NodeSelection } from 'da-y-wrapper';
import { getNx } from '../../../scripts/utils.js';
import {
  updateDocument, updateCursors, getInstrumentedHTML,
  editorHtmlChange, editorSelectChange, getEditor,
} from '../editor-utils/editor-utils.js';
import { getActiveBlockIndex, getBlockPositions } from '../editor-utils/blocks.js';
import {
  editorDocCanLoad,
  sourceUrlFromEditorCtx,
  controllerPathnameFromEditorCtx,
  editorDocRenderPhase,
} from './utils/ctx.js';
import { subscribeCollabUserList } from './utils/awareness-users.js';
import { describeDocSelection, applyHighlight, SEL_BLOCK, selectedNodePayload } from './utils/selection.js';
import {
  prefetchWysiwygCookiesIfSignedIn,
  wireQuickEditControllerPort,
} from './utils/quick-edit-host.js';
import { initIms as loadIms } from '../../shared/utils.js';
import { forceSave } from '../../shared/forcesave.js';
import initProse from './prose.js';
import { createTrackingPlugin } from '../editor-utils/prose-diff.js';
import { resolveEditorDocSession } from './utils/load-editor-doc.js';
import { afterNextPaint, ensureProseMountedInShadow } from './utils/shadow-mount.js';
import { teardownEditorDocResources } from './utils/teardown.js';
import { hideSelectionToolbar, setSelectionToolbarCtx } from '../editor-utils/selection-toolbar.js';
import { createExtensionsBridgePlugin } from '../editor-utils/extensions-bridge.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';
import { createCommentsStore } from '../../shared/comments/helpers/comments-store.js';
import { createCommentsController } from '../../shared/comments/helpers/controller.js';
import commentPlugin from '../../shared/comments/comment-plugin.js';
import { setCommentsController, openCommentsPanel } from '../editor-utils/comments-bridge.js';
import { commentMarkers, postCommentMarkers, postScrollToComment } from '../ew-comments/iframe-bridge.js';
import { createCommentGutter } from './utils/comment-gutter.js';
import getSheet from '../../shared/sheet.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);
const commentHighlightStyle = await getSheet('/blocks/shared/comments/comment-highlight.css');

export function createCommentsStoreFor(session, ctx) {
  return session?.docId
    ? createCommentsStore({ docId: session.docId, owner: ctx.org, repo: ctx.repo })
    : null;
}

export function publishCommentsController(store, wsProvider) {
  const controller = createCommentsController({ commentsStore: store, wsProvider });
  setCommentsController(controller);
  return controller;
}

export function subscribeCommentIframeBridge({ controller, getView, getPort }) {
  if (!controller?.subscribe) return () => {};

  const visible = () => controller.panelOpen || controller.showHighlights;

  const syncLayoutMarkers = () => {
    const port = getPort();
    const view = getView();
    if (!port || !view) return;
    const markers = visible() ? commentMarkers(view, controller) : [];
    postCommentMarkers(port, markers, controller);
  };

  return controller.subscribe(({ reason }) => {
    // Selecting a thread while the panel is closed (e.g. clicking a highlight
    // with the visibility toggle on) opens the panel. Handled before the port
    // guard so it also works in the doc-only view, which has no layout port.
    if (reason === 'selectedThreadId'
      && controller.selectedThreadId
      && !controller.panelOpen) {
      openCommentsPanel();
    }
    const port = getPort();
    const view = getView();
    if (!port || !view) return;
    if (reason === 'selectedThreadId') {
      if (visible()) postScrollToComment(port, view, controller);
      syncLayoutMarkers();
    } else if (reason === 'counts' || reason === 'docChange' || reason === 'init'
      || reason === 'panelOpen' || reason === 'showHighlights') {
      syncLayoutMarkers();
    }
  });
}

export class EwEditorDoc extends LitElement {
  static properties = {
    ctx: { type: Object },
    session: { type: Object },
    quickEditPort: { type: Object },
    _error: { state: true },
  };

  willUpdate(changed) {
    super.willUpdate(changed);
    if (changed.has('ctx')) {
      this.quickEditPort = undefined;
      this._teardown();
      setSelectionToolbarCtx();
      this._error = undefined;
      this._lastDocBlockIndex = undefined;
      this._lastDocSelKey = undefined;
      this._lastBroadcastNodeKey = undefined;
      editorHtmlChange.emit('');
    }
  }

  _clearControllerPort() {
    const port = this._controllerCtx?.port;
    if (port) {
      port.onmessage = null;
      port.close();
    }
    this._controllerCtx = undefined;
  }

  _emitCollabUsers(users) {
    this.dispatchEvent(new CustomEvent('da-collab-users', {
      bubbles: true,
      composed: true,
      detail: { users },
    }));
  }

  _emitHtmlChange() {
    const { view } = this._proseContext ?? {};
    if (!view) return;
    editorHtmlChange.emit(getInstrumentedHTML(view));
  }

  _emitUndoState() {
    const mgr = this._proseContext?.undoManager;
    const canUndo = mgr ? mgr.undoStack.length > 0 : false;
    const canRedo = mgr ? mgr.redoStack.length > 0 : false;
    this.dispatchEvent(new CustomEvent('nx-editor-undo-state', {
      bubbles: true,
      composed: true,
      detail: { canUndo, canRedo },
    }));
  }

  _observeUndoManager(mgr) {
    this._stopObservingUndoManager();
    if (!mgr) return;
    this._undoStackHandler = () => this._emitUndoState();
    mgr.on('stack-item-added', this._undoStackHandler);
    mgr.on('stack-item-popped', this._undoStackHandler);
  }

  _stopObservingUndoManager() {
    const mgr = this._proseContext?.undoManager;
    if (!mgr || !this._undoStackHandler) return;
    mgr.off('stack-item-added', this._undoStackHandler);
    mgr.off('stack-item-popped', this._undoStackHandler);
    this._undoStackHandler = undefined;
  }

  _scrollDocToBlock(blockIndex) {
    if (blockIndex < 0) return;
    const { view } = this._proseContext ?? {};
    if (!view) return;
    const positions = getBlockPositions(view);
    const pos = positions[blockIndex];
    if (pos == null) return;
    this._lastDocBlockIndex = blockIndex;
    const sel = NodeSelection.create(view.state.doc, pos);
    this._lastDocSelKey = `${sel.from}|${sel.to}|node`;
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
  }

  _broadcastSelectedNode(scrollIntoView = false) {
    const port = this._controllerCtx?.port;
    const { view } = this._proseContext ?? {};
    if (!port || !view) return;
    const node = selectedNodePayload(view);
    const key = node ? `${node.anchorType}:${node.proseIndex}` : 'null';
    const forceScroll = scrollIntoView && Boolean(node);
    if (!forceScroll && key === this._lastBroadcastNodeKey) return;
    this._lastBroadcastNodeKey = key;
    port.postMessage({
      type: MESSAGE_TYPES.SET_SELECTED_NODE,
      node,
      scrollIntoView: forceScroll,
      payload: { node, scrollIntoView: forceScroll },
    });
  }

  undo() {
    const { view } = this._proseContext ?? {};
    if (view) yUndo(view.state, view.dispatch);
  }

  redo() {
    const { view } = this._proseContext ?? {};
    if (view) yRedo(view.state, view.dispatch);
  }

  // Flush pending collab updates to da-admin before an external read (e.g. AEM
  // preview/publish). Without this, da-collab's debounced writer can leave the
  // last ~2s of edits unflushed when the preview action reads from da-admin.
  forceSave() {
    const { wsProvider } = this._proseContext ?? {};
    if (!wsProvider) return Promise.resolve({ ok: true });
    return forceSave(wsProvider);
  }

  _setupController() {
    const { view, wsProvider } = this._proseContext ?? {};
    if (!this.quickEditPort || !view || !wsProvider) return;
    if (this._controllerCtx?.port === this.quickEditPort) return;

    this._clearControllerPort();
    prefetchWysiwygCookiesIfSignedIn(this.ctx);

    const { org, repo } = this.ctx ?? {};
    this._controllerCtx = {
      view,
      wsProvider,
      port: this.quickEditPort,
      iframe: this._wysiwygIframe,
      suppressRerender: false,
      lastBlockIndex: undefined,
      owner: org,
      repo,
      path: controllerPathnameFromEditorCtx(this.ctx),
      getToken: async () => (await loadIms())?.accessToken?.token ?? null,
    };
    wireQuickEditControllerPort(this._controllerCtx);

    this._unsubCommentBridge?.();
    this._unsubCommentBridge = subscribeCommentIframeBridge({
      controller: this._commentsController,
      getView: () => this._proseContext?.view,
      getPort: () => this._controllerCtx?.port,
    });
  }

  _setupAwareness(wsProvider) {
    if (this._awarenessOff) {
      this._awarenessOff();
      this._awarenessOff = undefined;
    }
    this._awarenessOff = subscribeCollabUserList(wsProvider, (users) => {
      this._emitCollabUsers(users);
    });
  }

  _setEditable(editable) {
    this.requestUpdate();
    afterNextPaint(() => {
      const pm = this.shadowRoot?.querySelector('.ew-editor-doc-mount .ProseMirror');
      if (pm) pm.contentEditable = editable ? 'true' : 'false';
    });
  }

  _teardown() {
    this._stopObservingUndoManager();
    const { wsProvider, view, proseEl } = this._proseContext ?? {};
    teardownEditorDocResources({
      clearPortHandler: () => this._clearControllerPort(),
      awarenessOff: this._awarenessOff,
      wsProvider,
      view,
      proseEl,
      onCollabUsersCleared: () => this._emitCollabUsers([]),
    });
    this._awarenessOff = undefined;
    this._commentGutterOff?.();
    this._commentGutterOff = null;
    this._unsubCommentBridge?.();
    this._unsubCommentBridge = null;
    this._commentsController?.destroy();
    this._commentsController = null;
    this._commentsStore = null;
    setCommentsController(null);
    this._proseContext = undefined;
  }

  async _loadEditor() {
    if (!editorDocCanLoad(this.ctx)) {
      return;
    }

    const sourceUrl = sourceUrlFromEditorCtx(this.ctx);

    const session = this.session ?? await resolveEditorDocSession(sourceUrl);
    if (!session.ok) {
      this._error = session.error;
      return;
    }

    try {
      const { token, permissions } = session;
      const { proseEl, wsProvider, view, ydoc, undoManager } = await initProse({
        path: sourceUrl,
        permissions,
        setEditable: (editable) => this._setEditable(editable),
        getToken: () => token,
        extraPlugins: ({ wsProvider: ws }) => {
          this._commentsStore = createCommentsStoreFor(session, this.ctx);
          this._commentsController = createCommentsController({
            commentsStore: this._commentsStore,
            wsProvider: ws,
          });
          return [
            createExtensionsBridgePlugin(),
            createTrackingPlugin(
              () => {
                const body = this._controllerCtx
                  ? updateDocument(this._controllerCtx)
                  : getInstrumentedHTML(this._proseContext?.view);
                if (body) editorHtmlChange.emit(body);
              },
              () => { if (this._controllerCtx) updateCursors(this._controllerCtx); },
              (data) => { if (this._controllerCtx) getEditor(data, this._controllerCtx); },
              (pmView) => {
                const blockIndex = getActiveBlockIndex(pmView);
                const { kind, ...descriptor } = describeDocSelection(pmView);
                const selKey = `${descriptor.selFrom}|${descriptor.selTo}|${kind}`;
                const unchanged = blockIndex === this._lastDocBlockIndex
                  && selKey === this._lastDocSelKey;
                if (unchanged) return;
                this._lastDocBlockIndex = blockIndex;
                this._lastDocSelKey = selKey;
                editorSelectChange.emit({
                  blockIndex,
                  source: 'doc',
                  explicit: descriptor.selectionType === SEL_BLOCK,
                  ...descriptor,
                });
                this._broadcastSelectedNode(true);
              },
            ),
            commentPlugin({ controller: this._commentsController, store: this._commentsStore }),
          ];
        },
      });

      this._proseContext = { proseEl, wsProvider, view, ydoc, undoManager };
      // bindView has been called by now (EditorView creation triggered commentPlugin.view()),
      // so setPanelOpen dispatches will succeed when syncPanelOpen fires from this event.
      setCommentsController(this._commentsController);
      setSelectionToolbarCtx({ org: this.ctx?.org, site: this.ctx?.repo, sourceUrl });

      if (this._commentsStore) {
        const doLoad = () => {
          this._commentsStore.load().catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[comments] store load failed', err);
          });
        };
        // 'synced' can fire during initProse()'s await getCollabIdentity(), so
        // check wsProvider.synced first to avoid missing the event.
        if (wsProvider.synced) {
          doLoad();
        } else {
          const onSynced = (isSynced) => {
            if (!isSynced) return;
            wsProvider.off('synced', onSynced);
            doLoad();
          };
          wsProvider.on('synced', onSynced);
        }
      }

      this._setupAwareness(wsProvider);
      this._observeUndoManager(undoManager);
      this._emitHtmlChange();
      this._setupCommentGutter();

      this._setupController();
    } catch (e) {
      this._error = e?.message || 'Failed to load editor';
      this._proseContext = undefined;
      return;
    }

    this.requestUpdate();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, commentHighlightStyle];
    this._onCanvasEditorActive = (e) => {
      const view = e.detail?.view;
      this.hidden = view === 'layout';
      hideSelectionToolbar();
    };
    this.parentElement?.addEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this._onWysiwygPortReady = (e) => {
      const { port, iframe } = e.detail ?? {};
      if (port) {
        this._wysiwygIframe = iframe;
        this.quickEditPort = port;
      }
    };
    this.parentElement?.addEventListener('nx-wysiwyg-port-ready', this._onWysiwygPortReady);
    this._unsubscribeSelect = editorSelectChange
      .subscribe(({ blockIndex, source }) => {
        if (source === 'doc') return;
        this._scrollDocToBlock(blockIndex);
        if (source === 'outline') this._broadcastSelectedNode(true);
      });
    this._onCanvasHighlight = (e) => this._applyHighlight(e.detail);
    document.addEventListener('nx-highlight-selection', this._onCanvasHighlight);
  }

  _applyHighlight(detail) {
    applyHighlight(this._proseContext?.view, detail);
  }

  // EXPERIMENTAL: doc-mode right-margin initials bubbles (see comment-gutter.js).
  _setupCommentGutter() {
    this._commentGutterOff?.();
    if (!this._commentsController) return;
    afterNextPaint(() => {
      this._commentGutterOff = createCommentGutter({
        controller: this._commentsController,
        getView: () => this._proseContext?.view,
        getContainer: () => this.shadowRoot?.querySelector('.ew-editor-doc'),
      });
    });
  }

  disconnectedCallback() {
    this.parentElement?.removeEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this.parentElement?.removeEventListener('nx-wysiwyg-port-ready', this._onWysiwygPortReady);
    document.removeEventListener('nx-highlight-selection', this._onCanvasHighlight);
    this._unsubscribeSelect?.();
    this._teardown();
    setSelectionToolbarCtx();
    super.disconnectedCallback();
  }

  updated(changed) {
    super.updated(changed);
    if (changed.has('ctx')) {
      this._loadEditor();
    }
    if (changed.has('quickEditPort')) {
      if (this.quickEditPort && this._proseContext?.view) {
        this._setupController();
      } else if (!this.quickEditPort) {
        this._clearControllerPort();
      }
    }
    const { proseEl } = this._proseContext ?? {};
    if (proseEl) {
      ensureProseMountedInShadow({ shadowRoot: this.shadowRoot, proseEl });
    }
  }

  render() {
    const phase = editorDocRenderPhase(this.ctx, {
      error: this._error,
      hasEditorView: Boolean(this._proseContext?.view),
    });
    if (phase === 'incomplete') {
      return html`
        <div class="ew-editor-doc">
          <div class="ew-editor-doc-placeholder">
            Set hash to <code>#/org/site</code> and open an HTML file to edit.
          </div>
        </div>
      `;
    }
    if (phase === 'error') {
      return html`
        <div class="ew-editor-doc">
          <div class="ew-editor-doc-error">${this._error}</div>
        </div>
      `;
    }
    if (phase === 'loading') {
      return nothing;
    }
    return html`
      <div class="ew-editor-doc">
        <div class="ew-editor-doc-mount"></div>
      </div>
    `;
  }
}

customElements.define('ew-editor-doc', EwEditorDoc);
