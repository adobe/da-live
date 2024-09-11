/* eslint-disable max-classes-per-file */
import {
  DOMParser,
  EditorState,
  EditorView,
  Schema,
  TextSelection,
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
  InputRule,
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
import textTransform from './plugins/sectionPasteHandler.js';
import enterInputRules from './plugins/enterInputRule.js';
import { COLLAB_ORIGIN, getDaAdmin } from '../../shared/constants.js';
import { addLocNodes, getLocClass } from './loc-utils.js';

const DA_ORIGIN = getDaAdmin();

function addCustomMarks(marks) {
  const sup = {
    parseDOM: [{ tag: 'sup' }, { clearMark: (m) => m.type.name === 'sup' }],
    toDOM() { return ['sup', 0]; },
  };

  const sub = {
    parseDOM: [{ tag: 'sub' }, { clearMark: (m) => m.type.name === 'sub' }],
    toDOM() { return ['sub', 0]; },
  };

  const contextHighlight = { toDOM: () => ['span', { class: 'highlighted-context' }, 0] };

  return marks
    .addToEnd('sup', sup)
    .addToEnd('sub', sub)
    .addToEnd('contextHighlightingMark', contextHighlight);
}

function getImageNodeWithHref() {
  // due to bug in y-prosemirror, add href to image node
  // which will be converted to a wrapping <a> tag
  return {
    inline: true,
    attrs: {
      src: { validate: 'string' },
      alt: { default: null, validate: 'string|null' },
      title: { default: null, validate: 'string|null' },
      href: { default: null, validate: 'string|null' },
    },
    group: 'inline',
    draggable: true,
    parseDOM: [{
      tag: 'img[src]',
      getAttrs(dom) {
        return {
          src: dom.getAttribute('src'),
          title: dom.getAttribute('title'),
          alt: dom.getAttribute('alt'),
          href: dom.getAttribute('href'),
        };
      },
    }],
    toDOM(node) {
      const { src, alt, title, href } = node.attrs;
      return ['img', { src, alt, title, href }];
    },
  };
}

// Note: until getSchema() is separated in its own module, this function needs to be kept in-sync
// with the getSchema() function in da-collab src/collab.js
export function getSchema() {
  const { marks, nodes: baseNodes } = baseSchema.spec;
  const withLocNodes = addLocNodes(baseNodes);
  const withListnodes = addListNodes(withLocNodes, 'block+', 'block');
  const withTableNodes = withListnodes.append(tableNodes({ tableGroup: 'block', cellContent: 'block+' }));
  const nodes = withTableNodes.update('image', getImageNodeWithHref());
  return new Schema({ nodes, marks: addCustomMarks(marks) });
}

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

function pollForUpdates() {
  const daContent = document.querySelector('da-content');
  const daPreview = daContent.shadowRoot.querySelector('da-preview');
  if (!window.view) return;
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

function getDashesInputRule() {
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
      textTransform(schema),
      columnResizing(),
      tableEditing(),
      enterInputRules({ rules: [getDashesInputRule()] }),
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
        const LocAddedView = getLocClass('da-loc-added', getSchema, dispatchTransaction, { isLangstore: false });
        return new LocAddedView(node, view, getPos);
      },
      loc_deleted(node, view, getPos) {
        const LocDeletedView = getLocClass('da-loc-deleted', getSchema, dispatchTransaction, { isLangstore: true });
        return new LocDeletedView(node, view, getPos);
      },
    },
  });

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');

  return wsProvider;
}
