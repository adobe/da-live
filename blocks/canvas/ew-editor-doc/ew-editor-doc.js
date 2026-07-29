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

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { CHAT_EVENT } = await import(`${getNx()}/blocks/chat/constants.js`);

const style = await loadStyle(import.meta.url);

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
      this._canWrite = false;
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
      canWrite: this._canWrite === true,
      getToken: async () => (await loadIms())?.accessToken?.token ?? null,
    };
    wireQuickEditControllerPort(this._controllerCtx);
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
      this._canWrite = permissions.some((permission) => permission === 'write');
      const { proseEl, wsProvider, view, ydoc, undoManager } = await initProse({
        path: sourceUrl,
        permissions,
        setEditable: (editable) => this._setEditable(editable),
        getToken: () => token,
        extraPlugins: [
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
              if (blockIndex === this._lastDocBlockIndex && selKey === this._lastDocSelKey) return;
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
        ],
      });

      this._proseContext = { proseEl, wsProvider, view, ydoc, undoManager };
      setSelectionToolbarCtx({
        org: this.ctx?.org,
        site: this.ctx?.repo,
        sourceUrl,
        canWrite: this._canWrite,
      });
      this._setupAwareness(wsProvider);
      this._observeUndoManager(undoManager);
      this._emitHtmlChange();

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
    this.shadowRoot.adoptedStyleSheets = [style];
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
    document.addEventListener(CHAT_EVENT.HIGHLIGHT_SELECTION, this._onCanvasHighlight);
  }

  _applyHighlight(detail) {
    applyHighlight(this._proseContext?.view, detail);
  }

  disconnectedCallback() {
    this.parentElement?.removeEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this.parentElement?.removeEventListener('nx-wysiwyg-port-ready', this._onWysiwygPortReady);
    document.removeEventListener(CHAT_EVENT.HIGHLIGHT_SELECTION, this._onCanvasHighlight);
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
