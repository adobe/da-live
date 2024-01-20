// ProseMirror
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser } from 'prosemirror-model';
import { baseKeymap } from 'prosemirror-commands';
import { schema as baseSchema } from 'prosemirror-schema-basic';
import { history } from 'prosemirror-history';
import { addListNodes } from 'prosemirror-schema-list';
import { keymap } from 'prosemirror-keymap';
import { buildKeymap } from 'prosemirror-example-setup';
import {
  tableEditing,
  columnResizing,
  goToNextCell,
  tableNodes,
  fixTables,
} from 'prosemirror-tables';

// yjs
import {
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  undo,
  redo,
  prosemirrorToYXmlFragment,
} from 'da-y-wrapper';

// DA
import prose2aem from '../../shared/prose2aem.js';
import menu from './plugins/menu.js';
import imageDrop from './plugins/imageDrop.js';
import linkConverter from './plugins/linkConverter.js';
import { aem2prose, parse } from '../utils/helpers.js';

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
  const body = prose2aem(clone);
  daPreview.body = body;
}

function pollForUpdates() {
  const daContent = document.querySelector('da-content');
  const daPreview = daContent.shadowRoot.querySelector('da-preview');
  const proseEl = window.view.root.querySelector('.ProseMirror');
  if (!daPreview) return;

  // Perform an initial sync.
  // Doing this too quickly will result in an error.
  setTimeout(() => {
    setPreviewBody(daPreview, proseEl);
  }, 2000);

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

export default function initProse({ editor, path }) {
  const schema = getSchema();

  const ydoc = new Y.Doc();

  const server = 'wss://collab.da.live';
  const roomName = `https://admin.da.live${new URL(path).pathname}`;
  const wsProvider = new WebsocketProvider(server, roomName, ydoc);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  let firstUpdate = true;
  ydoc.on('update', (_, origin) => {
    if (firstUpdate) {
      firstUpdate = false;
      const aemMap = ydoc.getMap('aem');
      const current = aemMap.get('content');
      const inital = aemMap.get('initial');
      if (!current && inital) {
        const doc = parse(inital);
        const pdoc = aem2prose(doc);
        const docc = document.createElement('div');
        docc.append(...pdoc);
        const parser = DOMParser.fromSchema(schema);
        const fin = parser.parse(docc);
        prosemirrorToYXmlFragment(fin, yXmlFragment);
      }
    }
    if (origin && origin !== wsProvider) {
      const proseEl = window.view.root.querySelector('.ProseMirror');
      const clone = proseEl.cloneNode(true);
      const aem = prose2aem(clone);
      const aemMap = ydoc.getMap('aem');
      aemMap.set('content', aem);
    }
  });

  window.adobeIMS.getProfile().then(
    (profile) => {
      wsProvider.awareness.setLocalStateField('user', { color: '#008833', name: profile.displayName });
    },
  );

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
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
      }),
      keymap({
        Tab: goToNextCell(1),
        'Shift-Tab': goToNextCell(-1),
      }),
      history(),
    ],
  });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  window.view = new EditorView(editor, { state, dispatchTransaction });

  // openLibrary();

  // This is a demo showing how we can insert nodes without any extra gaps
  // setTimeout(() => {
  //   console.log(schema.nodes);
  //   const { horizontal_rule, heading } = schema.nodes;
  //   const hr = horizontal_rule.create();
  //   const para = heading.create(null, schema.text('columns'));
  //   const fragment = Fragment.fromArray([hr, para]);
  //   window.view.dispatch(window.view.state.tr.replaceSelectionWith(fragment.content[0]));
  // }, 4000);

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');
}
