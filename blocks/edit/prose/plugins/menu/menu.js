import {
  DOMParser,
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
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
  return {
    render(view) {
      const dom = document.createElement('button');
      dom.type = 'button';
      dom.className = 'img-alt-text';
      dom.title = title;
      dom.textContent = title;

      // Keep the editor's node selection on pointer activation.
      dom.addEventListener('mousedown', (event) => event.preventDefault());
      dom.addEventListener('click', () => {
        if (altTextPalette.isOpen()) {
          altTextPalette.close();
          return;
        }

        const { state, dispatch } = view;
        if (state.selection?.node?.type.name !== 'image') return;

        const fields = {
          altText: {
            placeholder: title,
            label: title,
            value: state.selection.node.attrs.alt ?? '',
          },
        };
        const callback = () => {
          const { pos } = state.selection.$anchor;
          dispatch(state.tr.setNodeAttribute(pos, 'alt', fields.altText.value?.trim()));
        };

        const promptOptions = { title, fields, callback, saveOnClose: true, useLabelsAbove: true };
        altTextPalette = openPrompt(promptOptions);
        altTextPalette.addEventListener('closed', () => {
          if (!view.hasFocus()) view.focus();
        });
      });

      return {
        dom,
        update(state) {
          const active = state.selection?.node?.type.name === 'image';
          dom.disabled = !active;
          dom.classList.toggle('ProseMirror-menu-disabled', !active);
          dom.classList.toggle('ProseMirror-menu-active', active);
          return true;
        },
      };
    },
  };
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
    tableItem('Insert column before', addColumnBefore, 'addColBefore'),
    tableItem('Insert column after', addColumnAfter, 'addColumnAfter'),
    tableItem('Delete column', deleteColumn, 'deleteColumn'),
    tableItem('Insert row before', addRowBefore, 'addRowBefore'),
    tableItem('Insert row after', addRowAfter, 'addRowAfter'),
    tableItem('Delete row', deleteRow, 'deleteRow'),
    tableItem('Merge cells', mergeCells, 'mergeCells'),
    tableItem('Split cell', splitCell, 'splitCell'),
    tableItem('Delete block', deleteTable, 'deleteTable'),
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
        toggleLibrary();
      },
      class: 'open-library',
    }),
    new Dropdown(editTable, {
      title: 'Edit block',
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

const menuKey = new PluginKey('menu');

const isImage = (node) => node?.type.name === 'image';
const isImageOnlyBlock = (node) => node.childCount === 1 && isImage(node.firstChild);

function cellStart($pos) {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.spec.tableRole?.includes('cell')) return $pos.before(d);
  }
  return -1;
}

// Native vertical caret movement never creates a node selection, so without this an image
// alone in its paragraph could only be selected with ArrowLeft/ArrowRight.
function selectImageVertically(view, dir) {
  const { state } = view;
  const { selection } = state;
  const { $from } = selection;
  if (!$from.parent.isTextblock) return false;
  const onImage = isImage(selection.node) && isImageOnlyBlock($from.parent);
  if (!onImage && !(selection.empty && view.endOfTextblock(dir < 0 ? 'up' : 'down'))) return false;
  const $edge = state.doc.resolve(dir < 0 ? $from.before() : $from.after());
  const target = TextSelection.findFrom($edge, dir, true);
  if (target && cellStart(target.$from) !== cellStart($from)) {
    // prosemirror-tables moves between cells but ignores non-empty selections, so hand it a caret.
    if (onImage) {
      const caret = TextSelection.create(state.doc, dir < 0 ? selection.from : selection.to);
      view.dispatch(state.tr.setSelection(caret));
    }
    return false;
  }
  if (!target || !isImageOnlyBlock(target.$from.parent)) return false;
  const imageSelection = NodeSelection.create(state.doc, target.$from.start());
  view.dispatch(state.tr.setSelection(imageSelection).scrollIntoView());
  return true;
}

// Set by a vertical arrow keydown that later plugins or the browser handle; consumed by the
// resulting selection change.
let verticalArrowPending = false;

export default new Plugin({
  key: menuKey,
  appendTransaction(trs, oldState, newState) {
    if (!verticalArrowPending || !trs.some((tr) => tr.selectionSet)) return null;
    verticalArrowPending = false;
    const { selection } = newState;
    if (!selection.empty || !isImageOnlyBlock(selection.$from.parent)) return null;
    return newState.tr.setSelection(NodeSelection.create(newState.doc, selection.$from.start()));
  },
  props: {
    handleKeyDown(view, event) {
      verticalArrowPending = false;
      const hasModifier = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
      if (!hasModifier && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (selectImageVertically(view, event.key === 'ArrowUp' ? -1 : 1)) return true;
        verticalArrowPending = true;
        return false;
      }
      // Table keymaps otherwise consume Shift+Tab before it can reach the toolbar.
      if (event.key !== 'Tab' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey
        || view.state.selection?.node?.type.name !== 'image') return false;
      const button = view.dom.parentElement.querySelector('.ProseMirror-menubar .img-alt-text');
      if (!button || button.disabled) return false;
      button.focus();
      return true;
    },
    handleDOMEvents: {
      mousedown: () => { verticalArrowPending = false; },
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
