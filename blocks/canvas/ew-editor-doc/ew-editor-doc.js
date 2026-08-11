import { LitElement, html, nothing } from 'da-lit';
import { yUndo, yRedo, NodeSelection, TextSelection } from 'da-y-wrapper';
import { getNx } from '../../../scripts/utils.js';
import {
  updateDocument, updateCursors, getInstrumentedHTML,
  editorHtmlChange, editorSelectChange, editorProseSelectChange, getEditor,
} from '../editor-utils/editor-utils.js';
import { getActiveBlockIndex, getBlockPositions, getTableBlockName } from '../editor-utils/blocks.js';
import {
  editorDocCanLoad,
  sourceUrlFromEditorCtx,
  controllerPathnameFromEditorCtx,
  editorDocRenderPhase,
} from './utils/ctx.js';
import { subscribeCollabUserList } from './utils/awareness-users.js';
import { describeDocSelection, applyHighlight, SEL_BLOCK, selectedNodePayload, activeContentProseIndex } from './utils/selection.js';
import {
  prefetchWysiwygCookiesIfSignedIn,
  wireQuickEditControllerPort,
} from './utils/quick-edit-host.js';
import { initIms as loadIms } from '../../shared/utils.js';
import { forceSave } from '../../shared/forcesave.js';
import initProse from './prose.js';
import { setBlockFocus, clearBlockFocus, getBlockFocus, isSelectionInFocusedBlock } from './prose-plugins/blockFocus.js';
import { persistBlockAnchor, readBlockAnchor, clearBlockAnchor } from '../utils/view.js';
import { createTrackingPlugin } from '../editor-utils/prose-diff.js';
import { resolveEditorDocSession } from './utils/load-editor-doc.js';
import { afterNextPaint, ensureProseMountedInShadow } from './utils/shadow-mount.js';
import { teardownEditorDocResources } from './utils/teardown.js';
import { hideSelectionToolbar, setSelectionToolbarCtx } from '../editor-utils/selection-toolbar.js';
import { createExtensionsBridgePlugin } from '../editor-utils/extensions-bridge.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';

// Maps ew-page-outline's default-content `kind` to the PM node type(s) it can back,
// so a matching node at proseIndex can be selected as a whole (see _scrollDocToProseIndex).
const CONTENT_KIND_NODE_NAMES = {
  paragraph: ['paragraph'],
  heading: ['heading'],
  list: ['bullet_list', 'ordered_list'],
  code: ['code_block'],
  quote: ['blockquote'],
};

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

  // TextSelection.near is the fallback for a drifted/mid-node proseIndex. A kind match
  // selects a NodeSelection instead, for the block-style highlight. Either way, broadcasts
  // the raw proseIndex, since that's what layout-view's data-prose-index carries.
  _scrollDocToProseIndex(proseIndex, kind) {
    if (proseIndex == null || proseIndex < 0) return;
    const { view } = this._proseContext ?? {};
    if (!view) return;
    const { doc } = view.state;
    if (proseIndex > doc.content.size) return;

    // The dispatch below runs the tracking plugin's onSelectionChange synchronously, which
    // would otherwise broadcast its own (null, for non-image/table selections) node payload
    // an instant before the correct one just below overwrites it.
    this._suppressAutoBroadcast = true;
    if (kind === 'image' && doc.nodeAt(proseIndex)?.type.name === 'image') {
      const sel = NodeSelection.create(doc, proseIndex);
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
      this._suppressAutoBroadcast = false;
      this._broadcastSelectedNode(true);
      return;
    }

    // Non-image content's proseIndex is one position inside the node's own start
    // (see activeContentProseIndex in utils/selection.js) — step back one for the anchor.
    const nodeStart = proseIndex - 1;
    const nodeNames = CONTENT_KIND_NODE_NAMES[kind];
    if (nodeStart >= 0 && nodeNames?.includes(doc.nodeAt(nodeStart)?.type.name)) {
      const sel = NodeSelection.create(doc, nodeStart);
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
      this._suppressAutoBroadcast = false;
      this._broadcastSelectedNode(true, { anchorType: 'content', proseIndex });
      return;
    }

    const sel = TextSelection.near(doc.resolve(proseIndex));
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
    this._suppressAutoBroadcast = false;
    this._broadcastSelectedNode(true, { anchorType: 'content', proseIndex });
  }

  // overrideNode lets content navigation (a TextSelection selectedNodePayload can't
  // classify) broadcast an explicit anchorType/proseIndex instead of a derived one.
  _broadcastSelectedNode(scrollIntoView = false, overrideNode = undefined) {
    if (this._suppressAutoBroadcast && overrideNode === undefined) return;
    const port = this._controllerCtx?.port;
    const { view } = this._proseContext ?? {};
    if (!port || !view) return;
    const node = overrideNode !== undefined ? overrideNode : selectedNodePayload(view);
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
              this._maybeExitBlockMode(pmView);
              const blockIndex = getActiveBlockIndex(pmView);
              const proseIndex = activeContentProseIndex(pmView);
              const { kind, ...descriptor } = describeDocSelection(pmView);
              const selKey = `${descriptor.selFrom}|${descriptor.selTo}|${kind}`;
              if (blockIndex === this._lastDocBlockIndex && selKey === this._lastDocSelKey) return;
              this._lastDocBlockIndex = blockIndex;
              this._lastDocSelKey = selKey;
              editorSelectChange.emit({
                blockIndex,
                proseIndex,
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
      this._setupBlockViewRestore(wsProvider);

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
      const prevView = this._editorView;
      this._editorView = view;
      this.hidden = view === 'layout';
      hideSelectionToolbar();
      const pmView = this._proseContext?.view;
      if (view === 'block') {
        if (pmView) this._persistBlockAnchor(pmView);
      } else {
        if (pmView) clearBlockFocus(pmView);
        // Only forget the anchor on a real exit (block -> elsewhere), not while simply
        // sitting in layout on load — that would erase the anchor before restore reads it.
        if (prevView === 'block') clearBlockAnchor();
      }
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
    this._unsubscribeProseSelect = editorProseSelectChange
      .subscribe(({ proseIndex, kind }) => this._scrollDocToProseIndex(proseIndex, kind));
    this._onCanvasHighlight = (e) => this._applyHighlight(e.detail);
    document.addEventListener(CHAT_EVENT.HIGHLIGHT_SELECTION, this._onCanvasHighlight);
  }

  _applyHighlight(detail) {
    applyHighlight(this._proseContext?.view, detail);
  }

  /** Remember which block block-view is focused on, so a reload can re-open it. */
  _persistBlockAnchor(pmView) {
    const pos = getBlockFocus(pmView.state);
    if (pos == null) return;
    const blockIndex = getBlockPositions(pmView).indexOf(pos);
    if (blockIndex < 0) return;
    const node = pmView.state.doc.nodeAt(pos);
    persistBlockAnchor({
      path: this.ctx?.path,
      blockIndex,
      name: node ? getTableBlockName(node) : undefined,
    });
  }

  /**
   * On load, if we were block-editing this same page, re-open that block once the doc
   * has synced (initProse returns before ySyncPlugin has populated the doc). Bails
   * quietly if the block is gone or changed identity.
   */
  _setupBlockViewRestore(wsProvider) {
    const anchor = readBlockAnchor();
    if (!anchor || anchor.path !== this.ctx?.path) return;
    // ySyncPlugin populates the doc a little after `synced`, so poll for the specific
    // block to appear rather than restoring on a single frame (which lands too early
    // and bails). Give up after a few seconds if the block never shows (e.g. deleted).
    const deadline = Date.now() + 4000;
    const attempt = () => {
      if (this.ctx?.path !== anchor.path) return;
      const view = this._proseContext?.view;
      const ready = !!view && wsProvider.synced
        && getBlockPositions(view)[anchor.blockIndex] != null;
      if (ready) {
        this._restoreBlockView(anchor);
        return;
      }
      if (Date.now() < deadline) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }

  _restoreBlockView(anchor) {
    const view = this._proseContext?.view;
    if (!view) return;
    const pos = getBlockPositions(view)[anchor.blockIndex];
    if (pos == null) return;
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'table') return;
    if (anchor.name && getTableBlockName(node) !== anchor.name) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    setBlockFocus(view, pos);
    document.querySelector('ew-canvas-header')?.setEditorView('block');
  }

  /**
   * In block view, leave back to layout only when the user genuinely moves on: the
   * focused block is gone, or the selection landed inside a *different* block (clicking
   * another block in the preview). A selection that merely drifted into a gap — an edit
   * echo, or deleting the block's last item row landing the cursor just past the
   * shrunken table — keeps the block being edited, so we stay and pull the selection
   * back inside instead.
   */
  _maybeExitBlockMode(pmView) {
    if (this._editorView !== 'block') return;
    const { state } = pmView;
    const focusPos = getBlockFocus(state);
    if (focusPos == null) return;
    const node = state.doc.nodeAt(focusPos);
    if (!node || node.type.name !== 'table') {
      this._exitBlockMode();
      return;
    }
    if (isSelectionInFocusedBlock(state)) return;
    const { from } = state.selection;
    const inAnotherBlock = getBlockPositions(pmView).some((pos) => {
      if (pos === focusPos) return false;
      const other = state.doc.nodeAt(pos);
      return !!other && from >= pos && from < pos + other.nodeSize;
    });
    if (inAnotherBlock) {
      this._exitBlockMode();
      return;
    }
    this._reanchorSelectionInBlock(focusPos);
  }

  // Defer so we don't switch views (and dispatch clearBlockFocus) mid-transaction.
  _exitBlockMode() {
    queueMicrotask(() => {
      if (this._editorView !== 'block') return;
      document.querySelector('ew-canvas-header')?.setEditorView('layout');
    });
  }

  /** Move the selection back inside the still-focused block after it drifted out. */
  _reanchorSelectionInBlock(pos) {
    queueMicrotask(() => {
      if (this._editorView !== 'block') return;
      const view = this._proseContext?.view;
      if (!view || getBlockFocus(view.state) !== pos) return;
      if (isSelectionInFocusedBlock(view.state)) return;
      const current = view.state.doc.nodeAt(pos);
      if (!current || current.type.name !== 'table') return;
      // Land just inside the block's closing boundary; TextSelection.near snaps into
      // the nearest editable text position within it.
      const inside = view.state.doc.resolve(pos + current.nodeSize - 1);
      view.dispatch(view.state.tr.setSelection(TextSelection.near(inside, -1)));
    });
  }

  disconnectedCallback() {
    this.parentElement?.removeEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this.parentElement?.removeEventListener('nx-wysiwyg-port-ready', this._onWysiwygPortReady);
    document.removeEventListener(CHAT_EVENT.HIGHLIGHT_SELECTION, this._onCanvasHighlight);
    this._unsubscribeSelect?.();
    this._unsubscribeProseSelect?.();
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
