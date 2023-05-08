import {EditorState} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {Schema, DOMParser} from "prosemirror-model";
import { baseKeymap } from "prosemirror-commands"
import { schema as baseSchema } from "prosemirror-schema-basic";
import { history } from 'prosemirror-history';
import { addListNodes } from "prosemirror-schema-list";
import { keymap } from 'prosemirror-keymap';
import { exampleSetup, buildMenuItems} from "prosemirror-example-setup";
import { MenuItem, Dropdown } from 'prosemirror-menu';
import insertTable from "./table.js";

import {
  tableEditing,
  columnResizing,
  goToNextCell,
  tableNodes,
  fixTables } from 'prosemirror-tables';
import menu from "./menu.js";



async function loadStyles() {
  const { getLibs } = await import('../../../scripts/utils.js');
  const { loadStyle } = await import(`${getLibs()}/utils/utils.js`);
  loadStyle('/node_modules/prosemirror-menu/style/menu.css');
}

function getSchema() {
  return new Schema({
    nodes: baseSchema.spec.nodes.append(
      tableNodes({ tableGroup: 'block', cellContent: 'block+' }),
    ),
    marks: baseSchema.spec.marks,
  });
}

export default function initProse(editor, content) {
  // loadStyles();

  const schema = getSchema();

  const doc = DOMParser.fromSchema(schema).parse(content);

  let state = EditorState.create({
    doc,
    plugins: [
      menu,
      columnResizing(),
      tableEditing(),
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

  window.view = new EditorView(editor, { state });

  document.execCommand('enableObjectResizing', false, 'false');
  document.execCommand('enableInlineTableEditing', false, 'false');
}
