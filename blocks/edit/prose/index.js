import {
  EditorState,
  EditorView,
  Schema,
  DOMParser,
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
  gapCursor,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  yUndo,
  yRedo,
  prosemirrorToYXmlFragment,
// eslint-disable-next-line import/no-unresolved
} from 'da-y-wrapper';

// DA
import prose2aem from '../../shared/prose2aem.js';
import menu from './plugins/menu.js';
import imageDrop from './plugins/imageDrop.js';
import linkConverter from './plugins/linkConverter.js';
import { aem2prose, parse } from '../utils/helpers.js';
import { DA_ORIGIN, COLLAB_ORIGIN } from '../../shared/constants.js';

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

// Apply the document in AEM doc format to the editor.
// For this it's converted to Prose and then applied to the current ydoc as an XML fragment
function setAEMDocInEditor(aemDoc, yXmlFragment, schema) {
  const doc = parse(aemDoc);
  const pdoc = aem2prose(doc);
  const docc = document.createElement('div');
  docc.append(...pdoc);
  const parser = DOMParser.fromSchema(schema);
  const fin = parser.parse(docc);
  prosemirrorToYXmlFragment(fin, yXmlFragment);
}

export function setConnectionStatus(connectionImg, status) {
  switch (status) {
    case 'connected':
    case 'online':
      connectionImg.src = '/blocks/edit/prose/img/Smock_Cloud_18_N.svg';
      break;
    case 'connecting':
    case 'offline':
      connectionImg.src = '/blocks/edit/prose/img/Smock_CloudDisconnected_18_N.svg';
      break;
    default:
      connectionImg.src = '/blocks/edit/prose/img/Smock_CloudError_18_N.svg';
      break;
  }
  connectionImg.alt = status;
  connectionImg.title = status;
}

function handleAwarenessUpdates(wsProvider, statusDiv, win) {
  const users = new Set();
  const usersDiv = statusDiv.querySelector('div.collab-users');

  wsProvider.awareness.on('update', (delta) => {
    const awarenessStates = wsProvider.awareness.getStates();

    delta.added.forEach((u) => users.add(u));
    delta.updated.forEach((u) => users.add(u));
    delta.removed.forEach((u) => users.delete(u));

    let html = '';
    for (const u of Array.from(users).sort()) {
      const name = awarenessStates.get(u)?.user?.name;
      if (name) {
        const initial = name.toString().substring(0, 1);
        html = html.concat(`<div class="collab-initial" title="${name}"><p>${initial}</p></div>`);
      } else {
        html = html.concat(`<div class="collab-icon">
          <img src="/blocks/edit/prose/img/Smock_RealTimeCustomerProfile_18_N.svg"
              alt="Other active user" class="collab-icon" alt="${u}" title="${u}"/></div>`);
      }
    }
    usersDiv.innerHTML = html;
  });

  const connectionImg = statusDiv.querySelector('img.collab-connection');
  wsProvider.on('status', (st) => setConnectionStatus(connectionImg, st.status));
  win.addEventListener('online', () => setConnectionStatus(connectionImg, 'online'));
  win.addEventListener('offline', () => setConnectionStatus(connectionImg, 'offline'));
}

export function createAwarenessStatusWidget(wsProvider, win = window) {
  const statusDiv = win.document.createElement('div');
  statusDiv.classList = 'collab-awareness';
  statusDiv.innerHTML = `<div class="collab-other-users">
    <div><img class="collab-connection collab-icon"></div>
    <div class="collab-users"></div>
  </div>`;

  const container = win.document.querySelector('da-title').shadowRoot.children[0];
  container.insertBefore(statusDiv, container.children[1]);

  handleAwarenessUpdates(wsProvider, statusDiv, win);
  return statusDiv;
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
  const statusDiv = createAwarenessStatusWidget(wsProvider);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  let firstUpdate = true;
  ydoc.on('update', (_, originWS) => {
    if (firstUpdate) {
      firstUpdate = false;

      // Do the following async to allow the ydoc to init itself with any
      // changes coming from other editors
      setTimeout(() => {
        const aemMap = ydoc.getMap('aem');
        const current = aemMap.get('content');
        const inital = aemMap.get('initial');
        if (!current && inital) {
          setAEMDocInEditor(inital, yXmlFragment, schema);
        }
      }, 1);
    }

    const serverInvKey = 'svrinv';
    const svrUpdate = ydoc.getMap('aem').get(serverInvKey);
    if (svrUpdate) {
      // push update from the server: re-init document
      statusDiv.remove();
      ydoc.destroy();
      wsProvider.destroy();
      editor.innerHTML = '';
      initProse({ editor, path });
      return;
    }

    if (originWS && originWS !== wsProvider) {
      const proseEl = window.view.root.querySelector('.ProseMirror');
      const clone = proseEl.cloneNode(true);
      const aem = prose2aem(clone);
      const aemMap = ydoc.getMap('aem');
      aemMap.set('content', aem);
    }
  });

  if (window.adobeIMS?.isSignedInUser()) {
    window.adobeIMS.getProfile().then(
      (profile) => {
        wsProvider.awareness.setLocalStateField('user', { color: '#008833', name: profile.displayName });
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
      gapCursor(),
      history(),
    ],
  });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  window.view = new EditorView(editor, { state, dispatchTransaction });

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');
}
