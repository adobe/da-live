/* eslint-disable max-classes-per-file */
import {
  EditorState,
  EditorView,
  buildKeymap,
  keymap,
  baseKeymap,
  tableEditing,
  columnResizing,
  fixTables,
  liftListItem,
  sinkListItem,
  gapCursor,
  TextSelection,
  NodeSelection,
  Plugin,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
} from 'da-y-wrapper';

import { getSchema } from 'da-parser';

// DA
import menu, { getHeadingKeymap } from './plugins/menu/menu.js';
import { linkItem } from './plugins/menu/linkItem.js';
import codemark from './plugins/codemark.js';
import imageDrop from './plugins/imageDrop.js';
import imageFocalPoint from './plugins/imageFocalPoint.js';
import tableSelectHandle from './plugins/tableSelectHandle.js';
import linkConverter from './plugins/linkConverter.js';
import linkTextSync from './plugins/linkTextSync.js';
import sectionPasteHandler from './plugins/sectionPasteHandler.js';
import base64Uploader from './plugins/base64uploader.js';
import { COLLAB_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import toggleLibrary from '../da-library/da-library.js';
import { checkDoc } from '../edit.js';
import { debounce, initDaMetadata } from '../utils/helpers.js';
import { getDiffClass, checkForLocNodes, addActiveView } from './diff/diff-utils.js';
import slashMenu from './plugins/slashMenu/slashMenu.js';
import linkMenu from './plugins/linkMenu/linkMenu.js';
import {
  handleTableBackspace,
  handleTableTab,
  getEnterInputRulesPlugin,
  getURLInputRulesPlugin,
  getListInputRulesPlugin,
  handleUndo,
  handleRedo,
} from './plugins/keyHandlers.js';

let lastCursorPosition = null;

function dispatchTransaction(transaction) {
  if (!window.view) return;

  const newState = window.view.state.apply(transaction);
  window.view.updateState(newState);

  if (transaction.docChanged) {
    debounce(checkForLocNodes, 500)(window.view);
  }
}

function setPreviewBody() {
  const daPreview = document.querySelector('da-content').shadowRoot.querySelector('da-preview');
  if (!daPreview) return;
  daPreview.setBody();
}

function trackCursorAndChanges() {
  let lastCursorPos = null;
  let lastBlockPos = null;
  let updateTimeout = null;
  let pendingDocChange = false;

  const schedulePreviewUpdate = () => {
    if (updateTimeout) clearTimeout(updateTimeout);

    updateTimeout = setTimeout(() => {
      setPreviewBody();
      pendingDocChange = false;
      updateTimeout = null;
    }, 500);
  };

  const getBlockPosition = (state, pos) => {
    // Resolve the position to get context about where it is in the document
    const $pos = state.doc.resolve(pos);

    // Find the depth of the nearest block-level node
    // Start from the deepest position and walk up to find a block
    for (let d = $pos.depth; d > 0; d -= 1) {
      const node = $pos.node(d);
      if (node.isBlock) {
        // Return the position before this block node
        return $pos.before(d);
      }
    }

    // Fallback to the position itself
    return pos;
  };

  return new Plugin({
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;

          if (docChanged) {
            // Document changed - schedule update after 500ms of no changes
            pendingDocChange = true;
            schedulePreviewUpdate();
            return;
          }

          // Only track cursor if no pending document changes
          if (pendingDocChange) return;

          const { from, to } = view.state.selection;
          const isNodeSelection = view.state.selection instanceof NodeSelection;

          // Don't update during text selection (when from !== to),
          // but allow node selections (like images)
          if (from !== to && !isNodeSelection) return;

          const currentPos = `${from}-${to}`;
          const currentBlockPos = getBlockPosition(view.state, from);

          // Only update if cursor position actually changed
          if (currentPos !== lastCursorPos) {
            // Only set preview body if:
            // 1. We had a lastCursorPos (not the first position)
            // 2. AND the block changed (moved to a different block/row)
            if (lastCursorPos && currentBlockPos !== lastBlockPos) {
              setPreviewBody();
            }
            lastCursorPos = currentPos;
            lastBlockPos = currentBlockPos;
          }
        },
      };
    },
  });
}

function handleProseLoaded(editor, wsProvider) {
  // Wait for the websocket to actually sync before marking as loaded
  const handleSynced = (isSynced) => {
    if (isSynced) {
      const daEditor = editor.getRootNode().host;
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('proseloaded', opts);
      daEditor.dispatchEvent(event);

      // Only listen to the first sync
      wsProvider.off('synced', handleSynced);
    }
  };

  wsProvider.on('synced', handleSynced);
}

function handleAwarenessUpdates(wsProvider, daTitle, win, path) {
  const users = new Set();

  wsProvider.awareness.on('update', (delta) => {
    delta.added.forEach((u) => users.add(u));
    delta.updated.forEach((u) => users.add(u));
    delta.removed.forEach((u) => users.delete(u));

    // Don't show the current user
    users.delete(wsProvider.awareness.clientID);

    const awarenessStates = wsProvider.awareness.getStates();
    const userMap = new Map();
    [...users].forEach((u, i) => {
      const userInfo = awarenessStates.get(u)?.user;
      if (!userInfo?.id) {
        userMap.set(`anonymous-${u}`, 'Anonymous');
      } else {
        userMap.set(`${userInfo.id}-${i}`, userInfo.name);
      }
    });
    daTitle.collabUsers = [...userMap.values()].sort();
  });

  wsProvider.on('status', (st) => { daTitle.collabStatus = st.status; });

  wsProvider.on('connection-close', async () => {
    const resp = await checkDoc(path);
    if (resp.status === 404) {
      const split = window.location.hash.slice(2).split('/');
      split.pop();
      // Navigate to the parent folder
      window.location.replace(`/#/${split.join('/')}`);
    }
  });
  win.addEventListener('online', () => { daTitle.collabStatus = 'online'; });
  win.addEventListener('offline', () => { daTitle.collabStatus = 'offline'; });
  const DISCONNECT_TIMEOUT = 10 * 60 * 1000;
  let disconnectTimeout = null;
  win.addEventListener('focus', () => {
    // cancel any pending disconnect
    if (disconnectTimeout) clearTimeout(disconnectTimeout);
    wsProvider.connect();
  });
  win.addEventListener('blur', () => {
    if (disconnectTimeout) clearTimeout(disconnectTimeout);
    disconnectTimeout = setTimeout(() => {
      wsProvider.disconnect();
    }, DISCONNECT_TIMEOUT);
  });
}

export function createAwarenessStatusWidget(wsProvider, win, path) {
  const daTitle = win.document.querySelector('da-title');
  handleAwarenessUpdates(wsProvider, daTitle, win, path);
  return daTitle;
}

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

function generateColor(name, hRange = [0, 360], sRange = [60, 80], lRange = [40, 60]) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const normalizeHash = (min, max) => Math.floor((hash % (max - min)) + min);
  const h = normalizeHash(hRange[0], hRange[1]);
  const s = normalizeHash(sRange[0], sRange[1]);
  const l = normalizeHash(lRange[0], lRange[1]) / 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function storeCursorPosition(view) {
  const { from, to } = view.state.selection;
  lastCursorPosition = { from, to };
}

function restoreCursorPosition(view) {
  if (lastCursorPosition) {
    const { from, to } = lastCursorPosition;
    const docSize = view.state.doc.content.size;
    if (from <= docSize && to <= docSize) {
      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
      view.dispatch(tr);
    } else {
      lastCursorPosition = null;
    }
  }
}

function addSyncedListener(wsProvider, canWrite) {
  const handleSynced = (isSynced) => {
    if (isSynced) {
      if (canWrite) {
        const pm = document.querySelector('da-content')?.shadowRoot
          .querySelector('da-editor')?.shadowRoot.querySelector('.ProseMirror');
        if (pm) pm.contentEditable = 'true';
      }
      wsProvider.off('synced', handleSynced);
    }
  };

  wsProvider.on('synced', handleSynced);
}

export default function initProse({ path, permissions }) {
  // Destroy ProseMirror if it already exists - GH-212
  if (window.view) {
    window.view.destroy();
    delete window.view;
  }
  const editor = document.createElement('div');
  editor.className = 'da-prose-mirror';

  const schema = getSchema();

  const ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = { protocols: ['yjs'] };

  if (window.adobeIMS?.isSignedInUser()) {
    const { token } = window.adobeIMS.getAccessToken();
    // add token to the sec-websocket-protocol header
    opts.protocols.push(token);
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, opts);

  // Increase the max backoff time to 30 seconds. If connection error occurs,
  // the socket provider will try to reconnect quickly at the beginning
  // (exponential backoff starting with 100ms) and then every 30s.
  wsProvider.maxBackoffTime = 30000;

  addSyncedListener(wsProvider, canWrite);

  createAwarenessStatusWidget(wsProvider, window, path);
  registerErrorHandler(ydoc);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  if (window.adobeIMS?.isSignedInUser()) {
    window.adobeIMS.getProfile().then((profile) => {
      wsProvider.awareness.setLocalStateField('user', {
        color: generateColor(profile.email || profile.userId),
        name: profile.displayName,
        id: profile.userId,
      });
    });
  } else {
    wsProvider.awareness.setLocalStateField('user', {
      color: generateColor(`${wsProvider.awareness.clientID}`),
      name: 'Anonymous',
      id: `anonymous-${wsProvider.awareness.clientID}}`,
    });
  }

  const plugins = [
    ySyncPlugin(yXmlFragment),
    yCursorPlugin(wsProvider.awareness),
    yUndoPlugin(),
    trackCursorAndChanges(),
    slashMenu(),
    linkMenu(),
    tableSelectHandle(),
    imageDrop(schema),
    linkConverter(schema),
    linkTextSync(),
    sectionPasteHandler(schema),
    base64Uploader(schema),
    columnResizing(),
    getEnterInputRulesPlugin(dispatchTransaction),
    getURLInputRulesPlugin(),
    getListInputRulesPlugin(schema),
    keymap(buildKeymap(schema)),
    keymap({ Backspace: handleTableBackspace }),
    keymap(baseKeymap),
    codemark(),
    keymap({
      'Mod-z': handleUndo,
      'Mod-y': handleRedo,
      'Mod-Shift-z': handleRedo,
      'Mod-Shift-l': toggleLibrary,
      'Mod-k': (state, dispatch, view) => { // toggle link prompt
        const linkMarkType = state.schema.marks.link;
        const linkMenuItem = linkItem(linkMarkType);
        return linkMenuItem.spec.run(state, dispatch, view);
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
  ];

  if (canWrite) {
    plugins.push(menu);
    plugins.push(imageFocalPoint());
  }

  let state = EditorState.create({ schema, plugins });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  window.view = new EditorView(editor, {
    state,
    dispatchTransaction,
    nodeViews: {
      diff_added(node, view, getPos) {
        const LocAddedView = getDiffClass('da-diff-added', getSchema, dispatchTransaction, { isUpstream: false });
        return new LocAddedView(node, view, getPos);
      },
      diff_deleted(node, view, getPos) {
        const LocDeletedView = getDiffClass('da-diff-deleted', getSchema, dispatchTransaction, { isUpstream: true });
        return new LocDeletedView(node, view, getPos);
      },
    },
    handleDOMEvents: {
      blur: (view) => {
        storeCursorPosition(view);
        return false;
      },
      focus: (view) => {
        restoreCursorPosition(view);
        return false;
      },
    },
    editable() { return canWrite; },
  });

  // Register view for global dialog management
  addActiveView(window.view);

  // Check for initial regional edits
  setTimeout(() => checkForLocNodes(window.view), 100);

  // yMap for storing document metadata (not synced to ProseMirror doc.attrs)
  initDaMetadata(ydoc.getMap('daMetadata'));

  handleProseLoaded(editor, wsProvider);

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');

  return { proseEl: editor, wsProvider };
}
