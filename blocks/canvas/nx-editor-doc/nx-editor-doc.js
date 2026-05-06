import { LitElement, html, nothing } from 'da-lit';
import { yUndo, yRedo, NodeSelection } from 'da-y-wrapper';
import { loadStyle } from '../../shared/nxutils.js';
import { updateDocument, updateCursors, getInstrumentedHTML, editorHtmlChange, editorSelectChange } from '../editor-utils/document.js';
import { getActiveBlockFlatIndex, getBlockPositions } from '../nx-editor-wysiwyg/utils/blocks.js';
import { getEditor } from '../editor-utils/state.js';
import {
  editorDocCanLoad,
  sourceUrlFromEditorCtx,
  controllerPathnameFromEditorCtx,
  editorDocRenderPhase,
} from './utils/ctx.js';
import { subscribeCollabUserList } from './utils/awareness-users.js';
import {
  prefetchWysiwygCookiesIfSignedIn,
  wireQuickEditControllerPort,
} from './utils/quick-edit-host.js';
import { initIms as loadIms } from '../../shared/utils.js';
import initProse from './prose.js';
import { createTrackingPlugin } from '../editor-utils/prose-diff.js';
import { resolveEditorDocSession } from './utils/load-editor-doc.js';
import { afterNextPaint, ensureProseMountedInShadow } from './utils/shadow-mount.js';
import { teardownEditorDocResources } from './utils/teardown.js';
import { hideSelectionToolbar } from '../editor-utils/selection-toolbar.js';
import { createExtensionsBridgePlugin } from '../editor-utils/extensions-bridge.js';

const style = await loadStyle(import.meta.url);

export class NxEditorDoc extends LitElement {
  static properties = {
    ctx: { type: Object },
    quickEditPort: { type: Object },
    _error: { state: true },
  };

  willUpdate(changed) {
    super.willUpdate(changed);
    if (changed.has('ctx')) {
      this.quickEditPort = undefined;
      this._teardown();
      this._error = undefined;
      this._lastDocBlockFlatIndex = undefined;
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

  _scrollDocToBlock(blockFlatIndex) {
    if (blockFlatIndex < 0) return;
    const { view } = this._proseContext ?? {};
    if (!view) return;
    const positions = getBlockPositions(view);
    const pos = positions[blockFlatIndex];
    if (pos == null) return;
    this._lastDocBlockFlatIndex = blockFlatIndex;
    const sel = NodeSelection.create(view.state.doc, pos);
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
  }

  undo() {
    const { view } = this._proseContext ?? {};
    if (view) yUndo(view.state, view.dispatch);
  }

  redo() {
    const { view } = this._proseContext ?? {};
    if (view) yRedo(view.state, view.dispatch);
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
      lastBlockFlatIndex: undefined,
      owner: org,
      repo,
      path: controllerPathnameFromEditorCtx(this.ctx),
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
      const pm = this.shadowRoot?.querySelector('.nx-editor-doc-mount .ProseMirror');
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

    const session = await resolveEditorDocSession(sourceUrl);
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
              const flatIndex = getActiveBlockFlatIndex(pmView);
              if (flatIndex === this._lastDocBlockFlatIndex) return;
              this._lastDocBlockFlatIndex = flatIndex;
              editorSelectChange.emit({ blockFlatIndex: flatIndex, source: 'doc' });
            },
          ),
        ],
      });

      this._proseContext = { proseEl, wsProvider, view, ydoc, undoManager };
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
      .subscribe(({ blockFlatIndex, source }) => {
        if (source !== 'doc') this._scrollDocToBlock(blockFlatIndex);
      });
  }

  disconnectedCallback() {
    this.parentElement?.removeEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this.parentElement?.removeEventListener('nx-wysiwyg-port-ready', this._onWysiwygPortReady);
    this._unsubscribeSelect?.();
    this._teardown();
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
        <div class="nx-editor-doc">
          <div class="nx-editor-doc-placeholder">
            Set hash to <code>#/org/site</code> and open an HTML file to edit.
          </div>
        </div>
      `;
    }
    if (phase === 'error') {
      return html`
        <div class="nx-editor-doc">
          <div class="nx-editor-doc-error">${this._error}</div>
        </div>
      `;
    }
    if (phase === 'loading') {
      return nothing;
    }
    return html`
      <div class="nx-editor-doc">
        <div class="nx-editor-doc-mount"></div>
      </div>
    `;
  }
}

customElements.define('nx-editor-doc', NxEditorDoc);
