import {
  DOMParser,
  Plugin,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  deleteTable,
  MenuItem,
  Dropdown,
  renderGrouped,
  blockTypeItem,
  wrapItem,
  setBlockType,
  toggleMark,
  yUndoPluginKey,
  wrapInList,
  liftListItem,
  sinkListItem,
// eslint-disable-next-line import/no-unresolved
} from 'da-y-wrapper';

import openPrompt from '../../../da-palette/da-palette.js';
import openLibrary from '../../../da-library/da-library.js';
import { handleUndo, handleRedo } from '../keyHandlers.js';
import insertTable from '../../table.js';
import { linkItem, removeLinkItem } from './linkItem.js';
import { markActive } from './menuUtils.js';

function canInsert(state, nodeType) {
  const { $from } = state.selection;
  // eslint-disable-next-line no-plusplus
  for (let d = $from.depth; d >= 0; d--) {
    const index = $from.index(d);
    if ($from.node(d).canReplaceWith(index, index, nodeType)) { return true; }
  }
  return false;
}

function cmdItem(cmd, options) {
  const passedOptions = {
    label: options.title,
    run: cmd,
  };
  // eslint-disable-next-line guard-for-in, no-restricted-syntax
  for (const prop in options) {
    passedOptions[prop] = options[prop];
  }
  if (!options.enable && !options.select) {
    passedOptions.enable = (state) => cmd(state);
  }
  return new MenuItem(passedOptions);
}

function imgAltTextItem() {
  let altTextPalette = { isOpen: () => false };
  const title = 'Alt text';
  return new MenuItem({
    title,
    label: title,
    class: 'img-alt-text',
    active(state) {
      return state.selection?.node?.type.name === 'image';
    },
    enable(state) { return this.active(state); },
    update() { return true; },
    run(state, dispatch) {
      if (altTextPalette.isOpen()) {
        altTextPalette.close();
        return;
      }

      const fields = {
        altText: {
          placeholder: title,
          label: title,
        },
      };

      const existingAltText = state.selection.node.attrs.alt;
      if (this.active(state)) {
        if (existingAltText) {
          fields.altText.value = existingAltText;
        }
      }

      const callback = () => {
        const { pos } = state.selection.$anchor;
        dispatch(state.tr.setNodeAttribute(pos, 'alt', fields.altText.value?.trim()));
      };

      altTextPalette = openPrompt(
        { title, altText: existingAltText, fields, callback, saveOnClose: true },
      );
    },
  });
}

function codeMarkItem(markType) {
  const title = 'Toggle inline code';
  const cmd = toggleMark(markType);

  return new MenuItem({
    title,
    label: title,
    class: 'edit-code',
    active(state) {
      return markActive(state, markType);
    },
    enable(state) {
      return cmd(state);
    },
    run: cmd,
  });
}

function codeBlockItem(codeBlockNode) {
  const cmd = setBlockType(codeBlockNode);

  return new MenuItem({
    title: 'Change to code block',
    label: 'Code',
    column: 2,
    class: 'menu-item-codeblock',
    enable(state) {
      return cmd(state);
    },
    active(state) {
      const { $from } = state.selection;
      return $from.parent.type.name === 'code_block';
    },
    run: cmd,
  });
}

function blockquoteItem(codeBlockNode) {
  return wrapItem(codeBlockNode, {
    title: 'Change to blockquote',
    label: 'Blockquote',
    column: 2,
    class: 'menu-item-blockquote',
  });
}

function headingItem(headingNode, options) {
  options.active = (state) => {
    const { $from } = state.selection;
    return $from.parent.type.name === 'heading'
      && $from.parent.attrs.level === options.attrs.level;
  };
  return blockTypeItem(headingNode, options);
}

function createBlockMenuItem(node, options) {
  const {
    type,
    level,
    title,
    label,
    column,
    class: className,
  } = options;
  const attrs = type === 'heading' ? { level } : {};
  const menuItem = type === 'heading' ? headingItem : blockTypeItem;

  const menuOptions = {
    title,
    label,
    attrs,
    ...(column && { column }),
    ...(className && { class: className }),
  };

  return menuItem(node, menuOptions);
}

export function getHeadingKeymap(schema) {
  const headingNode = schema.nodes.heading;
  const paragraphNode = schema.nodes.paragraph;

  const keymap = {
    'Mod-Alt-0': (state, dispatch) => {
      const menuItem = createBlockMenuItem(paragraphNode, {
        type: 'paragraph',
        title: 'Change to paragraph',
        label: 'P',
      });
      return menuItem.spec.run(state, dispatch);
    },
  };

  // Add heading shortcuts H1-H6
  [1, 2, 3, 4, 5, 6].forEach((level) => {
    keymap[`Mod-Alt-${level}`] = (state, dispatch) => {
      const menuItem = createBlockMenuItem(headingNode, {
        type: 'heading',
        level,
        title: `Change to heading ${level}`,
        label: `H${level}`,
      });
      return menuItem.spec.run(state, dispatch);
    };
  });

  return keymap;
}

function markItem(markType, options) {
  const passedOptions = { active(state) { return markActive(state, markType); } };
  // eslint-disable-next-line no-restricted-syntax, guard-for-in
  for (const prop in options) { passedOptions[prop] = options[prop]; }
  return cmdItem(toggleMark(markType), passedOptions);
}

function item(label, cmd, css) {
  return new MenuItem({ label, select: cmd, run: cmd, class: css });
}

function getTableMenu() {
  return [
    item('Insert column before', addColumnBefore, 'addColBefore'),
    item('Insert column after', addColumnAfter, 'addColumnAfter'),
    item('Delete column', deleteColumn, 'deleteColumn'),
    item('Insert row before', addRowBefore, 'addRowBefore'),
    item('Insert row after', addRowAfter, 'addRowAfter'),
    item('Delete row', deleteRow, 'deleteRow'),
    item('Merge cells', mergeCells, 'mergeCells'),
    item('Split cell', splitCell, 'splitCell'),
    item('Delete table', deleteTable, 'deleteTable'),
  ];
}

function getTextBlocks(marks, nodes) {
  const headingItems = [1, 2, 3, 4, 5, 6].map((i) => createBlockMenuItem(nodes.heading, {
    type: 'heading',
    level: i,
    title: `Change to H${i}`,
    label: `H${i}`,
    column: 2,
    class: `menu-item-h${i}`,
  }));

  return [
    createBlockMenuItem(nodes.paragraph, {
      type: 'paragraph',
      title: 'Change to paragraph',
      label: 'P',
      column: 2,
      class: 'menu-item-para',
    }),
    markItem(marks.strong, {
      title: 'Toggle bold',
      label: 'B',
      class: 'edit-bold',
    }),
    markItem(marks.em, {
      title: 'Toggle italic',
      label: 'I',
      class: 'edit-italic',
    }),
    markItem(marks.u, {
      title: 'Toggle underline',
      label: 'U',
      class: 'edit-underline',
    }),
    markItem(marks.s, {
      title: 'Toggle strikethrough',
      label: 'S',
      class: 'edit-strikethrough',
    }),
    markItem(marks.sup, {
      title: 'Toggle superscript',
      label: 'SUP',
      class: 'edit-sup',
    }),
    markItem(marks.sub, {
      title: 'Toggle subscript',
      label: 'SUB',
      class: 'edit-sub',
    }),
    codeMarkItem(marks.code),
    ...headingItems,
    blockquoteItem(nodes.blockquote),
    codeBlockItem(nodes.code_block),
  ];
}

function shouldEnableIndentOutdentIcon(state, listType) {
  const { $from } = state.selection;
  if ($from.node($from.depth - 1)?.type === listType) return true;
  return false;
}

function getListMenu(nodes) {
  return [
    new MenuItem({
      title: 'Bullet List',
      label: 'Bullet List',
      class: 'bullet-list',
      run(initialState, dispatch) {
        wrapInList(nodes.bullet_list)(initialState, dispatch);
      },
    }),
    new MenuItem({
      title: 'Ordered List',
      label: 'Ordered List',
      class: 'ordered-list',
      run(state, dispatch) {
        wrapInList(nodes.ordered_list)(state, dispatch);
      },
    }),
    new MenuItem({
      title: 'Indent List',
      label: 'Indent List',
      class: 'indent-list',
      enable(state) { return shouldEnableIndentOutdentIcon(state, nodes.list_item); },
      run(state, dispatch) {
        sinkListItem(nodes.list_item)(state, dispatch);
      },
    }),
    new MenuItem({
      title: 'Outdent List',
      label: 'Outdent List',
      class: 'outdent-list',
      enable(state) { return shouldEnableIndentOutdentIcon(state, nodes.list_item); },
      run: liftListItem(nodes.list_item),
    }),
  ];
}

export function insertSectionBreak(state, dispatch) {
  const div = document.createElement('div');
  div.append(document.createElement('hr'), document.createElement('p'));
  const newNodes = DOMParser.fromSchema(state.schema).parse(div);
  dispatch(state.tr.replaceSelectionWith(newNodes));
}

function getMenu(view) {
  const menu = document.createElement('div');
  menu.className = 'ProseMirror-menubar';

  const { marks, nodes } = view.state.schema;
  const editTable = getTableMenu();
  const textBlocks = getTextBlocks(marks, nodes);

  const textMenu = [
    new Dropdown(textBlocks, {
      title: 'Edit text',
      label: 'Edit text',
      class: 'edit-text',
    }),
    linkItem(marks.link),
    removeLinkItem(marks.link),
    imgAltTextItem(),
  ];

  const listMenu = [
    new Dropdown(getListMenu(nodes), {
      title: 'List menu',
      label: 'List',
      class: 'list-menu',
    }),
  ];

  const blockMenu = [
    new MenuItem({
      title: 'Open library',
      label: 'Library',
      enable() { return true; },
      run() {
        openLibrary();
      },
      class: 'open-library',
    }),
    new Dropdown(editTable, {
      title: 'Edit text',
      label: 'Edit block',
      class: 'edit-table',
    }),
    new MenuItem({
      title: 'Insert block',
      label: 'Block',
      run: insertTable,
      class: 'insert-table',
    }),
    new MenuItem({
      title: 'Insert section break',
      label: 'Section',
      enable(state) { return canInsert(state, nodes.horizontal_rule); },
      run: insertSectionBreak,
      class: 'edit-hr',
    }),
  ];

  const undoMenu = [
    new MenuItem({
      title: 'Undo last change',
      label: 'Undo',
      run: handleUndo,
      enable: (state) => yUndoPluginKey.getState(state)?.hasUndoOps,
      class: 'edit-undo',
    }),
    new MenuItem({
      title: 'Redo last undone change',
      label: 'Redo',
      run: handleRedo,
      enable: (state) => yUndoPluginKey.getState(state)?.hasRedoOps,
      class: 'edit-redo',
    }),
  ];

  const content = [textMenu, listMenu, blockMenu, undoMenu];

  const { dom, update } = renderGrouped(view, content);

  menu.append(dom);

  return { menu, update };
}

export default new Plugin({
  props: {
    handleDOMEvents: {
      focus: (view) => {
        view.root.querySelectorAll('da-palette').forEach((palette) => {
          palette.updateSelection();
        });
      },
    },
  },
  view: (view) => {
    const { menu, update } = getMenu(view);
    const palettes = document.createElement('div');
    palettes.className = 'da-palettes';
    view.dom.insertAdjacentElement('beforebegin', menu);
    view.dom.insertAdjacentElement('afterend', palettes);
    update(view.state);
    // eslint-disable-next-line no-shadow
    return { update: (view) => update(view.state) };
  },
});
