/* eslint-disable max-classes-per-file */
import {
  EditorState,
  EditorView,
  history,
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
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  yUndo,
  yRedo,
} from 'da-y-wrapper';

// DA
import prose2aem from '../../shared/prose2aem.js';
import menu from './plugins/menu.js';
import imageDrop from './plugins/imageDrop.js';
import linkConverter from './plugins/linkConverter.js';
import sectionPasteHandler from './plugins/sectionPasteHandler.js';
import base64Uploader from './plugins/base64uploader.js';
import { COLLAB_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import toggleLibrary from '../da-library/da-library.js';
import { getLocClass } from './loc-utils.js';
import { getSchema } from './schema.js';
import slashMenu from './plugins/slashMenu/slashMenu.js';
import { handleTableBackspace, handleTableTab, getEnterInputRulesPlugin } from './plugins/keyHandlers.js';

let sendUpdates = false;
let hasChanged = 0;
let lastCursorPosition = null;
let daPreview;
let updatePoller;

function dispatchTransaction(transaction) {
  if (!window.view) return;

  if (transaction.docChanged) {
    hasChanged += 1;
    sendUpdates = true;
  }
  const newState = window.view.state.apply(transaction);
  window.view.updateState(newState);
}

function setPreviewBody() {
  daPreview ??= document.querySelector('da-content')?.shadowRoot.querySelector('da-preview');
  if (!daPreview) return;

  const clone = window.view.docView.dom.cloneNode(true);
  const body = prose2aem(clone, true);
  daPreview.body = body;
}

export function pollForUpdates() {
  if (updatePoller) clearInterval(updatePoller);

  updatePoller = setInterval(() => {
    if (sendUpdates) {
      if (hasChanged > 0) {
        hasChanged = 0;
        return;
      }
      setPreviewBody();
      sendUpdates = false;
    }
  }, 500);
}

function handleProseLoaded(editor) {
  // Give the websocket time to connect and populate
  setTimeout(() => {
    const daEditor = editor.getRootNode().host;
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('proseloaded', opts);
    daEditor.dispatchEvent(event);

    // Give the preview elements time to create
    setTimeout(() => {
      setPreviewBody();
      pollForUpdates();
    }, 3000);
  }, 3000);
}

function handleAwarenessUpdates(wsProvider, daTitle, win) {
  const users = new Set();

  wsProvider.awareness.on('update', (delta) => {
    delta.added.forEach((u) => users.add(u));
    delta.updated.forEach((u) => users.add(u));
    delta.removed.forEach((u) => users.delete(u));

    // Don't show the current user
    users.delete(wsProvider.awareness.clientID);

    const awarenessStates = wsProvider.awareness.getStates();
    const userMap = new Map();
    [...users].forEach((u) => {
      const userInfo = awarenessStates.get(u)?.user;
      if (!userInfo?.id) {
        userMap.set(`anonymous-${u}`, 'Anonymous');
      } else if (userInfo.id !== wsProvider.awareness.getLocalState().user?.id) {
        userMap.set(userInfo.id, userInfo.name);
      }
    });
    daTitle.collabUsers = [...userMap.values()].sort();
  });

  wsProvider.on('status', (st) => { daTitle.collabStatus = st.status; });
  win.addEventListener('online', () => { daTitle.collabStatus = 'online'; });
  win.addEventListener('offline', () => { daTitle.collabStatus = 'offline'; });
}

export function createAwarenessStatusWidget(wsProvider, win) {
  const daTitle = win.document.querySelector('da-title');
  handleAwarenessUpdates(wsProvider, daTitle, win);
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
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
    view.dispatch(tr);
  }
}

export default function initProse({ path, permissions, docguid }, resetFunc) {
  // Destroy ProseMirror if it already exists - GH-212
  if (window.view) delete window.view;
  const editor = document.createElement('div');
  editor.className = 'da-prose-mirror';

  const schema = getSchema();

  const ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = {};

  if (window.adobeIMS?.isSignedInUser()) {
    opts.params = { Authorization: `Bearer ${window.adobeIMS.getAccessToken().token}` };
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, opts);
  createAwarenessStatusWidget(wsProvider, window);
  registerErrorHandler(ydoc);

  const curGuid = docguid ?? `new-${crypto.randomUUID()}`;

  const guidMap = ydoc.getMap('prosemirror-latestguid');
  guidMap.set('guid', curGuid);
  ydoc.on('update', () => {
    const guid = guidMap.get('guid');
    if (guid !== curGuid) {
      console.log('Document guid changed from', curGuid, 'to', guid);
      // if (curGuid.startsWith('new-')) {
      //   const oldFrag = ydoc.getXmlFragment(`prosemirror-${curGuid}`);
      //   const newFrag = ydoc.getXmlFragment(`prosemirror-${guid}`);

      //   newFrag.insert(0, oldFrag.clone());
      //   //   .map((item) => (item instanceof AbstractType ? item.clone() : item)));
      //   console.log('Copied old data to new guid', guid);
      // }
      resetFunc(guid);
    }
    if (guidMap.get('mismatch') === guid) {
      // eslint-disable-next-line no-console
      console.log('You are editing a document that has since been deleted! Your changes will not be persisted.');
    }
  });

  const yXmlFragment = ydoc.getXmlFragment(`prosemirror-${curGuid}`);

  if (window.adobeIMS?.isSignedInUser()) {
    window.adobeIMS.getProfile().then(
      (profile) => {
        wsProvider.awareness.setLocalStateField(
          'user',
          {
            color: generateColor(profile.email || profile.userId),
            name: profile.displayName,
            id: profile.userId,
          },
        );
      },
    );
  } else {
    wsProvider.awareness.setLocalStateField(
      'user',
      {
        color: generateColor(`${wsProvider.awareness.clientID}`),
        name: 'Anonymous',
        id: `anonymous-${wsProvider.awareness.clientID}}`,
      },
    );
  }

  const plugins = [
    ySyncPlugin(yXmlFragment),
    yCursorPlugin(wsProvider.awareness),
    yUndoPlugin(),
    slashMenu(),
    imageDrop(schema),
    linkConverter(schema),
    sectionPasteHandler(schema),
    base64Uploader(schema),
    columnResizing(),
    getEnterInputRulesPlugin(dispatchTransaction),
    keymap(buildKeymap(schema)),
    keymap({ Backspace: handleTableBackspace }),
    keymap(baseKeymap),
    keymap({
      'Mod-z': yUndo,
      'Mod-y': yRedo,
      'Mod-Shift-z': yRedo,
      'Mod-Shift-l': toggleLibrary,
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
    tableEditing(),
    history(),
  ];

  if (canWrite) plugins.push(menu);

  let state = EditorState.create({ schema, plugins });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  window.view = new EditorView(editor, {
    state,
    dispatchTransaction,
    nodeViews: {
      loc_added(node, view, getPos) {
        const LocAddedView = getLocClass('da-loc-added', getSchema, dispatchTransaction, { isLangstore: false });
        return new LocAddedView(node, view, getPos);
      },
      loc_deleted(node, view, getPos) {
        const LocDeletedView = getLocClass('da-loc-deleted', getSchema, dispatchTransaction, { isLangstore: true });
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

  handleProseLoaded(editor, permissions);

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');

  return { proseEl: editor, wsProvider };
}
