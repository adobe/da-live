/* eslint-disable max-classes-per-file */
import {
  DOMParser,
  EditorState,
  EditorView,
  TextSelection,
  history,
  buildKeymap,
  keymap,
  baseKeymap,
  tableEditing,
  columnResizing,
  goToNextCell,
  selectedRect,
  isInTable,
  addRowAfter,
  fixTables,
  liftListItem,
  sinkListItem,
  gapCursor,
  InputRule,
  inputRules,
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
import { COLLAB_ORIGIN, getDaAdmin } from '../../shared/constants.js';
import { getLocClass } from './loc-utils.js';
import { getSchema } from './schema.js';

const DA_ORIGIN = getDaAdmin();

let pollerSetUp = false;
let sendUpdates = false;
let hasChanged = 0;
function dispatchTransaction(transaction) {
  if (!window.view) return;

  if (transaction.docChanged) {
    hasChanged += 1;
    sendUpdates = true;
  }
  const newState = window.view.state.apply(transaction);
  window.view.updateState(newState);
}

function setPreviewBody(daPreview, proseEl) {
  const clone = proseEl.cloneNode(true);
  const body = prose2aem(clone, true);
  daPreview.body = body;
}

export function pollForUpdates(doc = document, win = window) {
  if (pollerSetUp) return;
  const daContent = doc.querySelector('da-content');
  const daPreview = daContent?.shadowRoot.querySelector('da-preview');
  if (!win.view) return;
  const proseEl = win.view.root.querySelector('.ProseMirror');
  if (!daPreview) return;

  setInterval(() => {
    if (sendUpdates) {
      if (hasChanged > 0) {
        hasChanged = 0;
        return;
      }
      setPreviewBody(daPreview, proseEl);
      sendUpdates = false;
    }
  }, 500);
  pollerSetUp = true;
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

export function getDashesInputRule() {
  return new InputRule(
    /^---[\n]$/,
    (state, match, start, end) => {
      const div = document.createElement('div');
      div.append(document.createElement('hr'));
      const newNodes = DOMParser.fromSchema(state.schema).parse(div);

      const selection = TextSelection.create(state.doc, start, end);
      dispatchTransaction(state.tr.setSelection(selection).replaceSelectionWith(newNodes));
    },
  );
}

// This function returns a modified inputrule plugin that triggers when the regex in the
// rule matches and the Enter key is pressed
export function getEnterInputRulesPlugin() {
  const irsplugin = inputRules({ rules: [getDashesInputRule()] });

  const hkd = (view, event) => {
    if (event.key !== 'Enter') return false;
    const { $cursor } = view.state.selection;
    if ($cursor) return irsplugin.props.handleTextInput(view, $cursor.pos, $cursor.pos, '\n');
    return false;
  };
  irsplugin.props.handleKeyDown = hkd; // Add the handleKeyDown function

  return irsplugin;
}

export default function initProse({ editor, path }) {
  // Destroy ProseMirror if it already exists - GH-212
  if (window.view) delete window.view;

  const schema = getSchema();

  const ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = {};

  if (window.adobeIMS?.isSignedInUser()) {
    opts.params = { Authorization: `Bearer ${window.adobeIMS.getAccessToken().token}` };
  }

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, opts);
  createAwarenessStatusWidget(wsProvider, window);
  registerErrorHandler(ydoc);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

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

  const handleTableTab = (direction) => {
    const isCursorInLastTableCell = (rect) => {
      const { left, bottom } = rect;
      const { height, width } = rect.map;
      return left + 1 === width && bottom === height;
    };

    const gtnc = goToNextCell(direction);
    return (state, dispatch) => {
      if (!isInTable(state)) return false;
      const rect = selectedRect(state);
      if (isCursorInLastTableCell(rect)) {
        addRowAfter(state, dispatch);
        return gtnc(window.view.state, dispatch);
      }
      return gtnc(state, dispatch);
    };
  };

  let state = EditorState.create({
    schema,
    plugins: [
      ySyncPlugin(yXmlFragment, {
        onFirstRender: () => {
          pollForUpdates();
        },
      }),
      yCursorPlugin(wsProvider.awareness),
      yUndoPlugin(),
      menu,
      imageDrop(schema),
      linkConverter(schema),
      sectionPasteHandler(schema),
      base64Uploader(schema),
      columnResizing(),
      tableEditing(),
      getEnterInputRulesPlugin(),
      keymap(buildKeymap(schema)),
      keymap(baseKeymap),
      keymap({
        'Mod-z': yUndo,
        'Mod-y': yRedo,
        'Mod-Shift-z': yRedo,
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
      history(),
    ],
  });

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
  });

  // Call pollForUpdates() to make sure it gets called even if the callback was made earlier
  pollForUpdates();

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');

  return wsProvider;
}
