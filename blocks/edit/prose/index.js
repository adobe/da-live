/* eslint-disable max-classes-per-file */
import {
  EditorState,
  EditorView,
  DOMParser,
  DOMSerializer,
  Fragment,
  Schema,
  Slice,
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
  prosemirrorToYXmlFragment,
// eslint-disable-next-line import/no-unresolved
} from 'da-y-wrapper';

// DA
import prose2aem from '../../shared/prose2aem.js';
import menu from './plugins/menu.js';
import imageDrop from './plugins/imageDrop.js';
import linkConverter from './plugins/linkConverter.js';
import { aem2prose, parse } from '../utils/helpers.js';
import { COLLAB_ORIGIN, getDaAdmin } from '../../shared/constants.js';

const LOC = {
  LANGSTORE: {
    BG: 'rgba(70, 130, 180, 0.8)',
    COVER_BG: 'rgba(70, 130, 180, 0.4)',
    TEXT: 'Langstore Content',
    TEXT_COLOR: 'rgba(70, 130, 180)',
  },
  REGIONAL: {
    BG: 'rgba(144, 42, 222, 0.8)',
    COVER_BG: 'rgba(144, 42, 222, 0.4)',
    TEXT: 'Regional Content',
    TEXT_COLOR: 'rgba(144, 42, 222)',
  },
};

const DA_ORIGIN = getDaAdmin();

function parseLocDOM(locTag) {
  return [{
    tag: locTag,
    contentElement: (dom) => {
      // Only parse the content of the node, not the temporary elements
      const deleteThese = dom.querySelectorAll('[delete]');
      deleteThese.forEach((e) => e.remove());
      return dom;
    },
  }];
}

export function getSchema() {
  const { marks, nodes: baseNodes } = baseSchema.spec;

  if (!baseNodes.content.includes('loc_deleted')) {
    baseNodes.content.push('loc_deleted');
    baseNodes.content.push({ group: 'block', content: 'block+', parseDOM: parseLocDOM('da-loc-deleted'),
      toDOM: () => ['da-loc-deleted', { contenteditable: false }, 0] });
    baseNodes.content.push('loc_added');
    baseNodes.content.push({ group: 'block', content: 'block+', parseDOM: parseLocDOM('da-loc-added'), toDOM: () => (['da-loc-added', { contenteditable: false }, 0]) });
  }

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

export function handleYDocUpdates({
  daTitle, editor, ydoc, path, schema, wsProvider, yXmlFragment, fnInitProse,
}, win = window, fnSetAEMDocInEditor = setAEMDocInEditor) {
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
          fnSetAEMDocInEditor(inital, yXmlFragment, schema);
        }
      }, 1);
    }

    const serverInvKey = 'svrinv';
    const svrUpdate = ydoc.getMap('aem').get(serverInvKey);
    if (svrUpdate) {
      // push update from the server: re-init document
      delete daTitle.collabStatus;
      delete daTitle.collabUsers;
      ydoc.destroy();
      wsProvider.destroy();
      editor.innerHTML = '';
      fnInitProse({ editor, path });
      return;
    }

    if (originWS && originWS !== wsProvider) {
      const proseEl = win.view.root.querySelector('.ProseMirror');
      const clone = proseEl.cloneNode(true);
      const aem = prose2aem(clone);
      const aemMap = ydoc.getMap('aem');
      aemMap.set('content', aem);
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
  const daTitle = createAwarenessStatusWidget(wsProvider, window);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');
  handleYDocUpdates({
    daTitle, editor, ydoc, path, schema, wsProvider, yXmlFragment, fnInitProse: initProse,
  });

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

  window.view = new EditorView(editor, {
    state,
    dispatchTransaction,
    nodeViews: {
      loc_added(node, view, getPos) {
        return new LocAddedView(node, view, getPos);
      },
      loc_deleted(node, view, getPos) {
        return new LocDeletedView(node, view, getPos);
      },
    },
  });

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');
}

function getCoverDiv({ isLangstore } = {}) {
  const coverDiv = document.createElement('div');
  coverDiv.className = `loc-color-overlay ${isLangstore ? 'loc-langstore' : 'loc-regional'}`;
  // TODO can I remove delete?
  coverDiv.setAttribute('delete', '');

  coverDiv.style.backgroundColor = isLangstore
    ? LOC.LANGSTORE.COVER_BG
    : LOC.REGIONAL.COVER_BG;
  return coverDiv;
}

function getLangOverlay({ isLangstore } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'loc-lang-overlay';
  overlay.setAttribute('delete', '');
  overlay.style.backgroundColor = isLangstore
    ? LOC.LANGSTORE.BG
    : LOC.REGIONAL.BG;

  const dialog = document.createElement('div');
  dialog.className = 'loc-dialog';
  dialog.innerHTML = `
    <span>${isLangstore ? LOC.LANGSTORE.TEXT : LOC.REGIONAL.TEXT}</span>
    <div>
      <span><div class="loc-keep" title="Keep">Keep</div></span>
      <span><div class="loc-delete" title="Delete">Delete</div></span>
    </div>`;
  dialog.style.color = isLangstore
    ? LOC.LANGSTORE.TEXT_COLOR
    : LOC.REGIONAL.TEXT_COLOR;

  const deleteBtn = dialog.querySelector('.loc-delete');
  const keepBtn = dialog.querySelector('.loc-keep');
  overlay.appendChild(dialog);

  return { overlay, deleteBtn, keepBtn };
}

function keepLocContentInPlace(view, pos, node) {
  node.content.content = node.content.content.filter((c) => c.content.content.length);
  const newFragment = Fragment.fromArray(node.content.content);
  const newSlice = new Slice(newFragment, 0, 0);
  const transaction = view.state.tr.replace(pos, pos + node.nodeSize, newSlice);
  dispatchTransaction(transaction);
}

function deleteLocContent(view, pos, node) {
  const resolvedPos = view.state.doc.resolve(pos);

  if (resolvedPos.parent.type.name === 'list_item') {
    const parentPos = resolvedPos.before(resolvedPos.depth);
    // Create a transaction that deletes the parent node
    const transaction = view.state.tr.delete(parentPos, parentPos + resolvedPos.parent.nodeSize);
    dispatchTransaction(transaction);
  } else {
    const transaction = view.state.tr.delete(pos, pos + node.nodeSize);
    dispatchTransaction(transaction);
  }
}

class LocDeletedView {
  constructor(node, view, getPos) {
    this.dom = document.createElement('da-loc-deleted');
    const serializer = DOMSerializer.fromSchema(getSchema());
    const nodeDOM = serializer.serializeFragment(node.content);

    this.dom.appendChild(nodeDOM);
    const coverDiv = getCoverDiv({ isLangstore: true });
    this.dom.appendChild(coverDiv);
    const { overlay, deleteBtn, keepBtn } = getLangOverlay({ isLangstore: true });
    this.langOverlay = overlay;

    deleteBtn.addEventListener('click', () => {
      deleteLocContent(view, getPos(), node);
    });

    keepBtn.addEventListener('click', () => {
      keepLocContentInPlace(view, getPos(), node);
    });

    coverDiv.appendChild(this.langOverlay);

    coverDiv.addEventListener('mouseover', () => {
      this.langOverlay.style.display = 'flex';
    });

    coverDiv.addEventListener('mouseout', () => {
      this.langOverlay.style.display = 'none';
    });
  }

  destroy() {
    this.coverDiv?.remove();
    this.langOverlay?.remove();
  }

  stopEvent() { return true; }
}

class LocAddedView {
  constructor(node, view, getPos) {
    this.dom = document.createElement('da-loc-added');
    const serializer = DOMSerializer.fromSchema(getSchema());

    const nodeDOM = serializer.serializeFragment(node.content);
    this.dom.appendChild(nodeDOM);

    const coverDiv = getCoverDiv({ isLangstore: false });
    this.dom.appendChild(coverDiv);
    const { overlay, deleteBtn, keepBtn } = getLangOverlay({ isLangstore: false });
    this.langOverlay = overlay;

    deleteBtn.addEventListener('click', () => {
      deleteLocContent(view, getPos(), node);
    });

    keepBtn.addEventListener('click', () => {
      keepLocContentInPlace(view, getPos(), node);
    });

    coverDiv.appendChild(this.langOverlay);

    coverDiv.addEventListener('mouseover', () => {
      this.langOverlay.style.display = 'flex';
    });

    coverDiv.addEventListener('mouseout', () => {
      this.langOverlay.style.display = 'none';
    });
  }

  destroy() {
    this.coverDiv?.remove();
    this.langOverlay?.remove();
  }

  stopEvent() { return true; }
}
