import {
  DOMParser,
  Plugin,
  PluginKey,
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
import toggleLibrary from './toggleLibrary.js';
import { handleUndo, handleRedo } from '../keyHandlers.js';
import insertTable from '../../table.js';
import { linkItem, removeLinkItem } from './linkItem.js';
import { markActive } from './menuUtils.js';
import { t } from '../../../../shared/i18n.js';

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
  const title = t('edit.prose.menu.altText');
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
  const title = t('edit.prose.menu.inlineCode.title');
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
    title: t('edit.prose.menu.codeBlock.title'),
    label: t('edit.prose.menu.codeBlock.label'),
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
    title: t('edit.prose.menu.blockquote.title'),
    label: t('edit.prose.menu.blockquote.label'),
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
        title: t('edit.prose.menu.paragraph.title'),
        label: t('edit.prose.menu.paragraph.label'),
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
        title: t('edit.prose.menu.heading.title', { level }),
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

function tableItem(label, cmd, css) {
  return new MenuItem({
    label,
    title: label,
    select: cmd,
    run: cmd,
    class: css,
  });
}

function getTableMenu() {
  return [
    tableItem(t('edit.prose.slash.table.insertColumnBefore'), addColumnBefore, 'addColBefore'),
    tableItem(t('edit.prose.slash.table.insertColumnAfter'), addColumnAfter, 'addColumnAfter'),
    tableItem(t('edit.prose.slash.table.deleteColumn'), deleteColumn, 'deleteColumn'),
    tableItem(t('edit.prose.slash.table.insertRowBefore'), addRowBefore, 'addRowBefore'),
    tableItem(t('edit.prose.slash.table.insertRowAfter'), addRowAfter, 'addRowAfter'),
    tableItem(t('edit.prose.slash.table.deleteRow'), deleteRow, 'deleteRow'),
    tableItem(t('edit.prose.slash.mergeCells'), mergeCells, 'mergeCells'),
    tableItem(t('edit.prose.slash.table.splitCell'), splitCell, 'splitCell'),
    tableItem(t('edit.prose.slash.table.deleteTable'), deleteTable, 'deleteTable'),
  ];
}

function getTextBlocks(marks, nodes) {
  const headingItems = [1, 2, 3, 4, 5, 6].map((i) => createBlockMenuItem(nodes.heading, {
    type: 'heading',
    level: i,
    title: t('edit.prose.menu.heading.title', { level: i }),
    label: `H${i}`,
    column: 2,
    class: `menu-item-h${i}`,
  }));

  return [
    createBlockMenuItem(nodes.paragraph, {
      type: 'paragraph',
      title: t('edit.prose.menu.paragraph.title'),
      label: t('edit.prose.menu.paragraph.label'),
      column: 2,
      class: 'menu-item-para',
    }),
    markItem(marks.strong, {
      title: t('edit.prose.menu.bold.title'),
      label: t('edit.prose.menu.bold.label'),
      class: 'edit-bold',
    }),
    markItem(marks.em, {
      title: t('edit.prose.menu.italic.title'),
      label: t('edit.prose.menu.italic.label'),
      class: 'edit-italic',
    }),
    markItem(marks.u, {
      title: t('edit.prose.menu.underline.title'),
      label: t('edit.prose.menu.underline.label'),
      class: 'edit-underline',
    }),
    markItem(marks.s, {
      title: t('edit.prose.menu.strike.title'),
      label: t('edit.prose.menu.strike.label'),
      class: 'edit-strikethrough',
    }),
    markItem(marks.sup, {
      title: t('edit.prose.menu.sup.title'),
      label: t('edit.prose.menu.sup.label'),
      class: 'edit-sup',
    }),
    markItem(marks.sub, {
      title: t('edit.prose.menu.sub.title'),
      label: t('edit.prose.menu.sub.label'),
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
      title: t('edit.prose.menu.bulletList'),
      label: t('edit.prose.menu.bulletList'),
      class: 'bullet-list',
      run(initialState, dispatch) {
        wrapInList(nodes.bullet_list)(initialState, dispatch);
      },
    }),
    new MenuItem({
      title: t('edit.prose.menu.orderedList'),
      label: t('edit.prose.menu.orderedList'),
      class: 'ordered-list',
      run(state, dispatch) {
        wrapInList(nodes.ordered_list)(state, dispatch);
      },
    }),
    new MenuItem({
      title: t('edit.prose.menu.indentList'),
      label: t('edit.prose.menu.indentList'),
      class: 'indent-list',
      enable(state) { return shouldEnableIndentOutdentIcon(state, nodes.list_item); },
      run(state, dispatch) {
        sinkListItem(nodes.list_item)(state, dispatch);
      },
    }),
    new MenuItem({
      title: t('edit.prose.menu.outdentList'),
      label: t('edit.prose.menu.outdentList'),
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
      title: t('edit.prose.menu.editText'),
      label: t('edit.prose.menu.editText'),
      class: 'edit-text',
    }),
    linkItem(marks.link),
    removeLinkItem(marks.link),
    imgAltTextItem(),
  ];

  const listMenu = [
    new Dropdown(getListMenu(nodes), {
      title: t('edit.prose.menu.list.title'),
      label: t('edit.prose.menu.list.label'),
      class: 'list-menu',
    }),
  ];

  const blockMenu = [
    new MenuItem({
      title: t('edit.prose.menu.library.title'),
      label: t('edit.prose.menu.library.label'),
      enable() { return true; },
      run() {
        toggleLibrary();
      },
      class: 'open-library',
    }),
    new Dropdown(editTable, {
      title: t('edit.prose.menu.editBlock'),
      label: t('edit.prose.menu.editBlock'),
      class: 'edit-table',
    }),
    new MenuItem({
      title: t('edit.prose.menu.block.title'),
      label: t('edit.prose.menu.block.label'),
      run: insertTable,
      class: 'insert-table',
    }),
    new MenuItem({
      title: t('edit.prose.menu.section.title'),
      label: t('edit.prose.menu.section.label'),
      enable(state) { return canInsert(state, nodes.horizontal_rule); },
      run: insertSectionBreak,
      class: 'edit-hr',
    }),
  ];

  const undoMenu = [
    new MenuItem({
      title: t('edit.prose.menu.undo.title'),
      label: t('edit.prose.menu.undo.label'),
      run: handleUndo,
      enable: (state) => yUndoPluginKey.getState(state)?.hasUndoOps,
      class: 'edit-undo',
    }),
    new MenuItem({
      title: t('edit.prose.menu.redo.title'),
      label: t('edit.prose.menu.redo.label'),
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

const menuKey = new PluginKey('menu');

export default new Plugin({
  key: menuKey,
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
