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

function handleAwarenessUpdates(wsProvider, statusDiv) {
  const users = new Set();
  const usersDiv = statusDiv.querySelector('div.collab-users');

  wsProvider.awareness.on('update', (delta) => {
    for (const u of delta.added) {
      users.add(u);
    }
    for (const u of delta.removed) {
      users.delete(u);
    }

    let html = '';
    /* */ html = html.concat('<div class="collab-initial"><p>A</p></div>');
    for (const u of Array.from(users).sort()) {
      if (/[a-zA-Z]/.test(u)) {
        // Contains letters so must be a user name
        const initial = u.toString().substring(0, 1);
        html = html.concat(`<div class="collab-initial" title="${u}"><p>${initial}</p></div>`);
      } else {
        html = html.concat(`<div class="collab-icon">
          <img src="/blocks/edit/prose/img/Smock_RealTimeCustomerProfile_18_N.svg"
              alt="Other active user" class="collab-icon" alt="${u}" title="${u}"/></div>`);
      }
    }
    usersDiv.innerHTML = html;
  });

  const connectionImg = statusDiv.querySelector('img.collab-connection');
  wsProvider.on('status', (st) => {
    const proseEl = window.view.root.querySelector('.ProseMirror');
    const connected = st.status === 'connected';
    proseEl.setAttribute('contenteditable', connected);
    proseEl.style['background-color'] = connected ? null : 'lightgrey';

    switch (st.status) {
      case 'connected':
        connectionImg.src = '/blocks/edit/prose/img/Smock_Cloud_18_N.svg';
        break;
      case 'connecting':
        connectionImg.src = '/blocks/edit/prose/img/Smock_CloudDisconnected_18_N.svg';
        break;
      default:
        connectionImg.src = '/blocks/edit/prose/img/Smock_CloudError_18_N.svg';
        break;
    }
    connectionImg.alt = st.status;
    connectionImg.title = st.status;
  });
}

function createAwarenessStatusWidget(wsProvider) {
  const statusDiv = document.createElement('div');
  statusDiv.classList = 'collab-awareness';
  statusDiv.innerHTML = `<div class="collab-other-users">
    <div><img class="collab-connection collab-icon"></div>
    <div class="collab-users"></div>
  </div>`;

  const container = window.document.querySelector('da-title').shadowRoot.children[0];
  container.insertBefore(statusDiv, container.children[1]);

  handleAwarenessUpdates(wsProvider, statusDiv);
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
  createAwarenessStatusWidget(wsProvider);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  let firstUpdate = true;
  ydoc.on('update', (_, originWS) => {
    if (firstUpdate) {
      firstUpdate = false;
      const aemMap = ydoc.getMap('aem');
      const current = aemMap.get('content');
      const inital = aemMap.get('initial');
      if (!current && inital) {
        setAEMDocInEditor(inital, yXmlFragment, schema);
      }
    }

    const serverInvKey = 'svrinv';
    const svrUpdate = ydoc.getMap('aem').get(serverInvKey);
    if (svrUpdate) {
      // push update from the server

      const timeout = ydoc.clientID % 2000;
      // Wait a small amount of time that's different for each client to ensure
      // they don't all apply it at the same time, as only one client needs to
      // apply the server-based invalidation.
      setTimeout(() => {
        // Check the value on the map again, if it's gone another client has
        // handled it already.
        const upd = ydoc.getMap('aem').get(serverInvKey);
        if (upd === undefined) {
          return;
        }

        const aemMap = ydoc.getMap('aem');
        aemMap.delete(serverInvKey);
        aemMap.set('content', upd);
        setAEMDocInEditor(upd, yXmlFragment, schema);
      }, timeout);
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
