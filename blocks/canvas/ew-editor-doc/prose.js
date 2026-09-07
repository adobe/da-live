/* eslint-disable import/no-unresolved -- importmap + da.live prose plugins */
import {
  EditorState,
  EditorView,
  fixTables,
  keymap,
  baseKeymap,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  yUndoPluginKey,
  yUndo,
  yRedo,
  buildKeymap,
  tableEditing,
  columnResizing,
  gapCursor,
  liftListItem,
  sinkListItem,
} from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import {
  getEnterInputRulesPlugin,
  getURLInputRulesPlugin,
  getListInputRulesPlugin,
  handleTableBackspace,
  handleTableTab,
} from '../../edit/prose/plugins/keyHandlers.js';
import { getHeadingKeymap } from '../../edit/prose/plugins/menu/menu.js';
import { createSlashMenuPlugin } from './slash-menu/slash-menu.js';
import { createSelectionToolbarPlugin, openLinkDialog } from '../editor-utils/selection-toolbar.js';
import codemark from '../../edit/prose/plugins/codemark.js';
import tableSelectHandle from '../../edit/prose/plugins/tableSelectHandle.js';
import imageDrop from './prose-plugins/imageDrop.js';
import imageFocalPoint from '../../edit/prose/plugins/imageFocalPoint.js';
import sectionPasteHandler from '../../edit/prose/plugins/sectionPasteHandler.js';
import base64Uploader from './prose-plugins/base64Uploader.js';
import blockFocus, { guardFocusedBlockDeletion } from './prose-plugins/blockFocus.js';
import { getNx } from '../../../scripts/utils.js';
import { getAuthToken } from '../../shared/utils.js';
import { generateColor, getCollabIdentity } from './utils/collab.js';
import { checkBlockLibraryConfigured } from '../editor-utils/block-slash.js';
import { canvasBus } from '../utils/canvas-bus.js';

const { DA_COLLAB, hashChange } = await import(`${getNx()}/utils/utils.js`);

function registerErrorHandler(ydoc) {
  ydoc.on('update', () => {
    const errorMap = ydoc.getMap('error');
    if (errorMap && errorMap.size > 0) {
      // eslint-disable-next-line no-console
      console.log('Error from server', JSON.stringify(errorMap));
      errorMap.clear();
    }
  });
}

// Collab diagnostic (temporary — remove once the multi-user editing investigation is
// done): logs every Y.Doc update with its true local/remote origin (Yjs's own
// `transaction.local`, set by y-websocket for updates received off the wire) and byte
// size, so it can be correlated against the tracking-plugin and iframe postMessage logs
// in editor-utils.js / prose-diff.js.
function describeActiveElement() {
  const el = document.activeElement;
  if (!el) return 'none';
  const shadowEl = el.shadowRoot?.activeElement;
  const inner = shadowEl ? `>${shadowEl.tagName?.toLowerCase()}.${[...shadowEl.classList].join('.')}` : '';
  return `${el.tagName?.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')}${inner}`;
}

function registerCollabDiagLogging(ydoc) {
  let localCount = 0;
  let remoteCount = 0;
  ydoc.on('update', (update, origin, doc, transaction) => {
    if (transaction.local) localCount += 1;
    else remoteCount += 1;
    // eslint-disable-next-line no-console
    console.debug(`[collab-diag] ydoc update origin=${transaction.local ? 'local' : 'remote'} bytes=${update.length} at ${performance.now().toFixed(1)} total-local=${localCount} total-remote=${remoteCount} activeElement=${describeActiveElement()} docHasFocus=${document.hasFocus()}`);
  });
}

// Collab diagnostic (temporary — remove once the investigation is done): tracks the doc
// ProseMirror view's own DOM focus/blur, and where focus lands when it leaves, to test
// whether processing a remote update knocks focus off the doc editor mid-typing.
function registerFocusDiagLogging(view) {
  const onFocus = () => {
    // eslint-disable-next-line no-console
    console.debug(`[collab-diag] doc view FOCUS at ${performance.now().toFixed(1)} activeElement=${describeActiveElement()}`);
  };
  const onBlur = () => {
    // eslint-disable-next-line no-console
    console.debug(`[collab-diag] doc view BLUR at ${performance.now().toFixed(1)} activeElement=${describeActiveElement()} viewHasFocus=${view.hasFocus()} contentEditable=${view.dom.contentEditable}`);
  };
  view.dom.addEventListener('focus', onFocus);
  view.dom.addEventListener('blur', onBlur);
}

function addSyncedListener(wsProvider, canWrite, setEditable) {
  const handleSynced = (isSynced) => {
    if (isSynced) {
      if (canWrite && typeof setEditable === 'function') {
        setEditable(true);
      }
      wsProvider.off('synced', handleSynced);
    }
  };
  wsProvider.on('synced', handleSynced);
}

function checkLibraryConfiguredOnSync(wsProvider, canWrite) {
  if (!canWrite) return;
  const handleSynced = (isSynced) => {
    if (!isSynced) return;
    wsProvider.off('synced', handleSynced);
    const unsub = hashChange.subscribe((s) => {
      if (s?.org && s?.site) checkBlockLibraryConfigured({ org: s.org, site: s.site });
    });
    unsub?.();
  };
  wsProvider.on('synced', handleSynced);
}

export default async function initProse({
  path, permissions, setEditable, getToken,
  extraPlugins = [],
}) {
  const editor = document.createElement('div');
  editor.className = 'da-prose-mirror';
  editor.setAttribute('data-gramm', 'false');
  editor.setAttribute('data-gramm_editor', 'false');

  const schema = getSchema();
  const ydoc = new Y.Doc();

  const server = DA_COLLAB;
  // da-collab reads the store off the room name, and `path` is already the store's source url.
  const roomName = path;

  const wsOpts = { protocols: ['yjs'] };
  let lastSentToken = null;
  if (typeof getToken === 'function') {
    const t = getToken();
    if (t) {
      wsOpts.protocols.push(t);
      lastSentToken = t;
    }
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, wsOpts);
  wsProvider.maxBackoffTime = 30000;

  wsProvider.on('connection-close', async (event) => {
    // Server close codes: 4401 = token expired (refresh + retry), 4403 = forbidden (stop).
    if (event?.code === 4403) {
      wsProvider.shouldConnect = false;
      return;
    }
    if (event?.code === 4401) {
      try { await window.adobeIMS?.refreshToken?.(); } catch { /* ignore */ }
      const fresh = await getAuthToken();
      if (!fresh || fresh === lastSentToken) {
        wsProvider.shouldConnect = false;
        if (lastSentToken) {
          try {
            const { showAuthBanner } = await import('../../shared/da-auth-banner/da-auth-banner.js');
            showAuthBanner();
          } catch { /* ignore */ }
        }
        return;
      }
      wsProvider.protocols = ['yjs', fresh];
      lastSentToken = fresh;
      return;
    }
    const fresh = await getAuthToken();
    wsProvider.protocols = fresh ? ['yjs', fresh] : ['yjs'];
    lastSentToken = fresh;
  });

  addSyncedListener(wsProvider, canWrite, setEditable);
  checkLibraryConfiguredOnSync(wsProvider, canWrite);
  registerErrorHandler(ydoc);
  registerCollabDiagLogging(ydoc);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  const identity = await getCollabIdentity();
  if (typeof getToken === 'function' && getToken() && identity) {
    wsProvider.awareness.setLocalStateField('user', {
      color: generateColor(identity.colorSeed),
      name: identity.name,
      id: identity.id,
    });
  } else {
    wsProvider.awareness.setLocalStateField('user', {
      color: generateColor(`${wsProvider.awareness.clientID}`),
      name: 'Anonymous',
      id: `anonymous-${wsProvider.awareness.clientID}`,
    });
  }

  /** @type {import('prosemirror-view').EditorView | null} */
  let viewRef = null;
  const dispatch = (tr) => { if (viewRef) viewRef.dispatch(tr); };

  /* Keymap order matches da.live prose/index.js: baseKeymap after buildKeymap +
   * handleTableBackspace (fixes list Enter + table NodeSelection + Backspace). */
  const plugins = [
    ySyncPlugin(yXmlFragment),
    yCursorPlugin(wsProvider.awareness),
    yUndoPlugin(),
    tableSelectHandle(),
    imageDrop(schema, () => path),
    sectionPasteHandler(schema),
    base64Uploader({ getSourceUrl: () => path, getEditorView: () => viewRef }),
    columnResizing(),
    getEnterInputRulesPlugin(dispatch),
    getURLInputRulesPlugin(),
    getListInputRulesPlugin(schema),
    // Runs before the base/table keymaps so it can veto deleting the block being edited.
    keymap({ Backspace: guardFocusedBlockDeletion, Delete: guardFocusedBlockDeletion }),
    keymap(buildKeymap(schema)),
    keymap({ Backspace: handleTableBackspace }),
    keymap(baseKeymap),
    codemark(),
    keymap({
      'Mod-z': (state) => yUndo(state) || false,
      'Mod-y': (state) => yRedo(state) || false,
      'Mod-Shift-z': (state) => yRedo(state) || false,
      'Mod-k': (_state, _dispatch, view) => {
        if (!view.editable) return false;
        openLinkDialog(view);
        return true;
      },
      'Mod-Alt-s': () => {
        canvasBus.newVersionRequest.emit();
        return true;
      },
      ...getHeadingKeymap(schema),
    }),
    keymap({
      Tab: handleTableTab(1),
      'Shift-Tab': handleTableTab(-1),
    }),
    keymap({
      Tab: sinkListItem(schema.nodes.list_item),
      'Shift-Tab': liftListItem(schema.nodes.list_item),
    }),
    gapCursor(),
    tableEditing({ allowTableNodeSelection: true }),
    blockFocus(),
    ...extraPlugins,
  ];

  if (canWrite) {
    plugins.unshift(createSlashMenuPlugin(), createSelectionToolbarPlugin());
    plugins.push(imageFocalPoint());
  }

  let state = EditorState.create({ schema, plugins });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  viewRef = new EditorView(editor, {
    state,
    editable() { return canWrite; },
  });
  registerFocusDiagLogging(viewRef);

  const undoManager = yUndoPluginKey.getState(viewRef.state)?.undoManager ?? null;

  return { proseEl: editor, wsProvider, view: viewRef, ydoc, undoManager };
}
