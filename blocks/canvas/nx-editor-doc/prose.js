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
import {
  getEnterInputRulesPlugin,
  getURLInputRulesPlugin,
  getListInputRulesPlugin,
  handleTableBackspace,
  handleTableTab,
} from 'https://da.live/blocks/edit/prose/plugins/keyHandlers.js';
import { getHeadingKeymap } from 'https://da.live/blocks/edit/prose/plugins/menu/menu.js';
import { getSchema } from 'da-parser';
import { createSlashMenuPlugin } from './slash-menu/slash-menu.js';
import { createSelectionToolbarPlugin } from '../editor-utils/selection-toolbar.js';
import codemark from './prose-plugins/codemark.js';
import tableSelectHandle from './prose-plugins/tableSelectHandle.js';
import imageDrop from './prose-plugins/imageDrop.js';
import imageFocalPoint from './prose-plugins/imageFocalPoint.js';
import sectionPasteHandler from './prose-plugins/sectionPasteHandler.js';
import base64Uploader from './prose-plugins/base64Uploader.js';
import { DA_ADMIN, DA_COLLAB } from '../../shared/nxutils.js';
import { generateColor, getCollabIdentity } from './utils/collab.js';

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
  const roomName = `${DA_ADMIN}${new URL(path).pathname}`;

  const wsOpts = { protocols: ['yjs'] };
  if (typeof getToken === 'function') {
    const t = getToken();
    if (t) wsOpts.params = { Authorization: `Bearer ${t}` };
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, wsOpts);
  wsProvider.maxBackoffTime = 30000;

  addSyncedListener(wsProvider, canWrite, setEditable);
  registerErrorHandler(ydoc);

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
    keymap(buildKeymap(schema)),
    keymap({ Backspace: handleTableBackspace }),
    keymap(baseKeymap),
    codemark(),
    keymap({
      'Mod-z': (state) => yUndo(state) || false,
      'Mod-y': (state) => yRedo(state) || false,
      'Mod-Shift-z': (state) => yRedo(state) || false,
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

  const undoManager = yUndoPluginKey.getState(viewRef.state)?.undoManager ?? null;

  return { proseEl: editor, wsProvider, view: viewRef, ydoc, undoManager };
}
