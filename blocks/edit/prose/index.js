import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser } from "prosemirror-model";
import { baseKeymap } from "prosemirror-commands"
import { schema as baseSchema } from "prosemirror-schema-basic";
import { history } from 'prosemirror-history';
import { addListNodes } from "prosemirror-schema-list";
import { keymap } from 'prosemirror-keymap';
import { buildKeymap } from "prosemirror-example-setup";
import prose2aem from '../../shared/prose2aem.js';

import {
  tableEditing,
  columnResizing,
  goToNextCell,
  tableNodes,
  fixTables } from 'prosemirror-tables';
import menu from './menu.js';

function getSchema() {
  const { marks, nodes: baseNodes } = baseSchema.spec;
  const withListnodes = addListNodes(baseNodes, 'block+', 'block');
  const nodes = withListnodes.append(tableNodes({ tableGroup: 'block', cellContent: 'block+' }));
  return new Schema({ nodes, marks });
}

function dispatchTransaction(transaction) {
  const before = transaction.before.content.size;
  const after = transaction.doc.content.size;

  console.log(`size before: ${before}, size after: ${after}`);
  const newState = view.state.apply(transaction);
  view.updateState(newState)
}

function pollForUpdates() {
  const daContent = document.querySelector('da-content');
  const daPreview = daContent.shadowRoot.querySelector('da-preview');

  if (!daPreview) return;
  let count = 1;
  const updatePreview = setInterval(async () => {
    const clone = window.view.root.querySelector('.ProseMirror').cloneNode(true);
    const body = prose2aem(clone);
    daPreview.body = body;
  }, 3000);
}

export default function initProse(editor, content) {
  console.log(editor.parentElement);

  const schema = getSchema();

  const doc = DOMParser.fromSchema(schema).parse(content);

  let state = EditorState.create({
    doc,
    plugins: [
      menu,
      columnResizing(),
      tableEditing(),
      keymap(buildKeymap(schema)),
      keymap(baseKeymap),
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

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');

  pollForUpdates();
}
