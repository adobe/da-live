import {
  EditorState,
  EditorView,
  Schema,
  baseSchema,
  history,
  buildKeymap,
  keymap,
  addListNodes,
  baseKeymap,
  tableEditing,
  columnResizing,
  goToNextCell,
  tableNodes,
  fixTables,
  liftListItem,
  sinkListItem,
  gapCursor,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  yUndo,
  yRedo,
// eslint-disable-next-line import/no-unresolved
} from 'da-y-wrapper';

// DA
import prose2aem from '../../shared/prose2aem.js';
import menu from './plugins/menu.js';
import imageDrop from './plugins/imageDrop.js';
import linkConverter from './plugins/linkConverter.js';
import { COLLAB_ORIGIN, getDaAdmin } from '../../shared/constants.js';

const DA_ORIGIN = getDaAdmin();

function getSchema() {
  const { marks, nodes: baseNodes } = baseSchema.spec;
  const withListnodes = addListNodes(baseNodes, 'block+', 'block');
  const nodes = withListnodes.append(tableNodes({ tableGroup: 'block', cellContent: 'block+' }));
  const contextHighlightingMark = { toDOM: () => ['span', { class: 'highlighted-context' }, 0] };
  const customMarks = marks.addToEnd('contextHighlightingMark', contextHighlightingMark);
  return new Schema({ nodes, marks: customMarks });
}

let sendUpdates = false;
let hasChanged = 0;
function dispatchTransaction(transaction) {
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

function pollForUpdates() {
  const daContent = document.querySelector('da-content');
  const daPreview = daContent.shadowRoot.querySelector('da-preview');
  const proseEl = window.view.root.querySelector('.ProseMirror');
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
    // eslint-disable-next-line no-console
    console.log('Error from server', JSON.stringify(ydoc.getMap('error')));
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

export default function initProse({ editor, path }) {
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
      columnResizing(),
      tableEditing(),
      keymap(buildKeymap(schema)),
      keymap(baseKeymap),
      keymap({
        'Mod-z': yUndo,
        'Mod-y': yRedo,
        'Mod-Shift-z': yRedo,
      }),
      keymap({
        Tab: goToNextCell(1),
        'Shift-Tab': goToNextCell(-1),
      }),
      keymap({ 'Shift-Tab': liftListItem(schema.nodes.list_item) }),
      keymap({ Tab: sinkListItem(schema.nodes.list_item) }),
      gapCursor(),
      history(),
    ],
  });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  window.view = new EditorView(editor, { state, dispatchTransaction });

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');

  return wsProvider;
}
