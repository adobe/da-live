import {
  DOMParser,
  Plugin,
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
  toggleMark,
  undo,
  redo,
  wrapInList,
  liftListItem,
  sinkListItem,
// eslint-disable-next-line import/no-unresolved
} from 'da-y-wrapper';

import openPrompt from '../../da-palette/da-palette.js';
import openLibrary from '../../da-library/da-library.js';

import insertTable from '../table.js';
import { getRepoId, openAssets } from '../../da-assets/da-assets.js';

const repoId = await getRepoId();

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
    if (!options.enable && !options.select) {
      passedOptions[options.enable ? 'enable' : 'select'] = (state) => cmd(state);
    }
  }
  return new MenuItem(passedOptions);
}

function markActive(state, type) {
  const { from, to, $from, $to, empty } = state.selection;
  if (empty) {
    return !!type.isInSet(state.storedMarks || $from.marksAcross($to) || []);
  }
  return state.doc.rangeHasMark(from, to, type);
}

function defaultLinkFields() {
  return {
    href: {
      placeholder: 'https://...',
      label: 'URL',
    },
    title: {
      placeholder: 'title',
      label: 'Title',
    },
  };
}

function findExistingLink(state, linkMarkType) {
  const { $from, $to, empty } = state.selection;
  if (empty) {
    const { node, offset } = $from.parent.childAfter($from.parentOffset);
    return {
      link: node,
      offset,
    };
  }
  let result;
  // eslint-disable-next-line no-unused-vars
  $from.parent.nodesBetween($from.parentOffset, $to.parentOffset, (node, pos, _parent, _index) => {
    if (linkMarkType.isInSet(node.marks)) {
      result = {
        link: node,
        offset: pos,
      };
    }
  });
  return result;
}

function calculateLinkPosition(state, link, offset) {
  const { $from } = state.selection;
  const start = $from.pos - ($from.parentOffset - offset);
  return {
    start,
    end: start + link.nodeSize,
  };
}

function linkItem(linkMarkType) {
  const label = 'Link';

  let lastPrompt = { isOpen: () => false };

  return new MenuItem({
    title: 'Add or Edit link',
    label,
    class: 'edit-link',
    active(state) { return markActive(state, linkMarkType); },
    enable(state) {
      return state.selection.content().content.childCount <= 1
        && (!state.selection.empty || this.active(state));
    },
    run(initialState, dispatch, view) {
      if (lastPrompt.isOpen()) {
        lastPrompt.close();
        return;
      }

      const fields = defaultLinkFields();

      let existingLink;
      let existingLinkOffset;
      if (this.active(view.state)) {
        ({
          link: existingLink,
          offset: existingLinkOffset,
        } = findExistingLink(view.state, linkMarkType));
        const existingLinkMark = existingLink
          && existingLink.marks.find((mark) => mark.type.name === linkMarkType.name);

        if (existingLinkMark) {
          fields.href.value = existingLinkMark.attrs.href;
          fields.title.value = existingLinkMark.attrs.title;
        }
      }

      const { $from, $to } = view.state.selection;

      let start;
      let end;
      if (this.active(view.state)) {
        ({ start, end } = calculateLinkPosition(view.state, existingLink, existingLinkOffset));
      } else {
        start = $from.pos;
        end = $to.pos;
      }

      dispatch(view.state.tr
        .addMark(start, end, view.state.schema.marks.contextHighlightingMark.create({}))
        .setMeta('addToHistory', false));

      const callback = (attrs) => {
        const tr = view.state.tr
          .setSelection(TextSelection.create(view.state.doc, start, end));
        if (fields.href.value) {
          dispatch(tr.addMark(start, end, linkMarkType.create(attrs)));
        } else if (this.active(view.state)) {
          dispatch(tr.removeMark(start, end, linkMarkType));
        }

        view.focus();
      };

      lastPrompt = openPrompt({ title: label, fields, callback, saveOnClose: true });
      lastPrompt.addEventListener('closed', () => {
        dispatch(view.state.tr.removeMark(start, end, view.state.schema.marks.contextHighlightingMark).setMeta('addToHistory', false));
      });
    },
  });
}

function removeLinkItem(linkMarkType) {
  return new MenuItem({
    title: 'Remove link',
    label: 'Remove Link',
    class: 'edit-unlink',
    active(state) { return markActive(state, linkMarkType); },
    enable(state) { return this.active(state); },
    // eslint-disable-next-line no-unused-vars
    run(state, dispatch, _view) {
      const { link, offset } = findExistingLink(state, linkMarkType);
      const { start, end } = calculateLinkPosition(state, link, offset);
      const tr = state.tr.setSelection(TextSelection.create(state.doc, start, end))
        .removeMark(start, end, linkMarkType);
      dispatch(tr);
    },
  });
}

function imgAltTextItem() {
  let altTextPalette = { isOpen: () => false };
  const title = 'Image Alt Text';
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
  return [
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
    item('separator', null, 'separator'),
    blockTypeItem(nodes.paragraph, {
      title: 'Change to paragraph',
      label: 'P',
      class: 'menu-item-para',
    }),
    blockTypeItem(nodes.heading, {
      title: 'Change to H1',
      label: 'H1',
      attrs: { level: 1 },
      class: 'menu-item-h1',
    }),
    blockTypeItem(nodes.heading, {
      title: 'Change to H2',
      label: 'H2',
      attrs: { level: 2 },
      class: 'menu-item-h2',
    }),
    blockTypeItem(nodes.heading, {
      title: 'Change to h3',
      label: 'h3',
      attrs: { level: 3 },
      class: 'menu-item-h3',
    }),
    blockTypeItem(nodes.heading, {
      title: 'Change to h4',
      label: 'h4',
      attrs: { level: 4 },
      class: 'menu-item-h4',
    }),
    blockTypeItem(nodes.heading, {
      title: 'Change to h5',
      label: 'h5',
      attrs: { level: 5 },
      class: 'menu-item-h5',
    }),
    blockTypeItem(nodes.heading, {
      title: 'Change to h6',
      label: 'h6',
      attrs: { level: 6 },
      class: 'menu-item-h6',
    }),
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

function getMenu(view) {
  const menu = document.createElement('div');
  menu.className = 'ProseMirror-menubar';

  const { marks, nodes } = view.state.schema;
  const editTable = getTableMenu();
  const textBlocks = getTextBlocks(marks, nodes);

  const textMenu = [
    new Dropdown(textBlocks, {
      label: 'Edit Text',
      class: 'edit-text',
    }),
    linkItem(marks.link),
    removeLinkItem(marks.link),
    imgAltTextItem(),
  ];

  const listMenu = [
    new Dropdown(getListMenu(nodes), {
      label: 'List Menu',
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
    new MenuItem({
      title: 'Open assets',
      label: 'Assets',
      enable() { return !!repoId; },
      async run() { openAssets(); },
      class: 'open-assets',
    }),
    new Dropdown(editTable, {
      label: 'Edit Block',
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
      label: 'HR',
      enable(state) { return canInsert(state, nodes.horizontal_rule); },
      run(state, dispatch) {
        const div = document.createElement('div');
        div.append(document.createElement('hr'), document.createElement('p'));
        const newNodes = DOMParser.fromSchema(state.schema).parse(div);
        dispatch(state.tr.replaceSelectionWith(newNodes));
      },
      class: 'edit-hr',
    }),
  ];

  const undoMenu = [
    new MenuItem({
      title: 'Undo last change',
      label: 'Undo',
      run: undo,
      enable: (state) => undo(state),
      class: 'edit-undo',
    }),
    new MenuItem({
      title: 'Redo last undone change',
      label: 'Redo',
      run: redo,
      enable: (state) => redo(state),
      class: 'edit-redo',
    }),
  ];

  const content = [textMenu, listMenu, blockMenu, undoMenu];

  const { dom, update } = renderGrouped(view, content);

  const editTableMenu = dom.querySelector('.ProseMirror-menu-dropdown.edit-table');
  const editTableItem = editTableMenu.closest('.ProseMirror-menuitem');
  editTableItem.classList.add('edit-table');

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
