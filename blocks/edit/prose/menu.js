import { Plugin } from "prosemirror-state";
import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import insertTable from "./table.js";
import { icons, MenuItem, Dropdown, renderGrouped, blockTypeItem, undoItem, redoItem } from 'prosemirror-menu';
import { wrapInList } from 'prosemirror-schema-list';

import {
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  deleteTable } from 'prosemirror-tables';

function canInsert(state, nodeType) {
  let $from = state.selection.$from;
  for (let d = $from.depth; d >= 0; d--) {
      let index = $from.index(d);
      if ($from.node(d).canReplaceWith(index, index, nodeType))
          return true;
  }
  return false;
}

function cmdItem(cmd, options) {
  let passedOptions = {
      label: options.title,
      run: cmd
  };
  for (const prop in options) {
    passedOptions[prop] = options[prop];
    if (!options.enable && !options.select) {
      passedOptions[options.enable ? "enable" : "select"] = state => cmd(state);
    }
  }
  return new MenuItem(passedOptions);
}

function wrapListItem(nodeType, options) {
  return cmdItem(wrapInList(nodeType, options.attrs), options);
}

function markActive(state, type) {
  let { from, $from, to, empty } = state.selection;
  if (empty)
      return !!type.isInSet(state.storedMarks || $from.marks());
  else
      return state.doc.rangeHasMark(from, to, type);
}

function markItem(markType, options) {
  let passedOptions = {
      active(state) { return markActive(state, markType); }
  };
  for (let prop in options)
      passedOptions[prop] = options[prop];
  return cmdItem(toggleMark(markType), passedOptions);
}

function item(label, cmd, css) {
  return new MenuItem({ label, select: cmd, run: cmd, class: css });
}

function getTableMenu() {
  return [
    item('Insert column before', addColumnBefore, 'insertColBefore'),
    item('Insert column after', addColumnAfter),
    item('Delete column', deleteColumn),
    item('Insert row before', addRowBefore),
    item('Insert row after', addRowAfter),
    item('Delete row', deleteRow),
    item('Delete table', deleteTable),
    item('Merge cells', mergeCells),
    item('Split cell', splitCell),
  ];
}

export default new Plugin({
  view: (view) => {
    const { marks, nodes } = view.state.schema;
    const editTable = getTableMenu();

    const content = [
      [
        markItem(marks.strong, {
          title: "Toggle bold",
          label: "B",
        }),
        markItem(marks.em, {
          title: "Toggle italic",
          label: "I",
        }),
      ],
      [
        blockTypeItem(nodes.paragraph, {
          title: "Change to paragraph",
          label: "P"
        }),
        blockTypeItem(nodes.heading, {
          title: "Change to H1",
          label: "H1",
          attrs: { level: 1 }
        }),
      ],
      [
        wrapListItem(nodes.bullet_list, {
          title: "Wrap in bullet list",
          icon: icons.bulletList
        })
      ],
      [
        new MenuItem({
          title: "Insert block",
          label: "Block",
          run: insertTable
        }),
        new Dropdown(editTable, {
          label: 'Edit Block',
          class: 'edit-table'
        }),
        new MenuItem({
          title: "Insert horizontal rule",
          label: "HR",
          enable(state) { return canInsert(state, nodes.horizontal_rule); },
          run(state, dispatch) { dispatch(state.tr.replaceSelectionWith(nodes.horizontal_rule.create())); }
        }),
      ],
      [
        undoItem,
        redoItem,
      ]
    ];

    const { dom, update } = renderGrouped(view, content);

    const wrapper = document.createElement('div');
    wrapper.className = 'ProseMirror-menubar-wrapper';

    const menubar = document.createElement('div');
    menubar.className = 'ProseMirror-menubar';
    menubar.appendChild(dom);
    wrapper.appendChild(menubar);

    view.dom.parentNode.replaceChild(wrapper, view.dom)
    wrapper.appendChild(view.dom)

    update(view.state);

    return {
      update: (view) => update(view.state),
    }
  },
});
