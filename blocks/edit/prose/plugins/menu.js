import { Plugin, TextSelection } from 'prosemirror-state';
import { toggleMark } from 'prosemirror-commands';
import { DOMParser, NodeRange } from 'prosemirror-model';
import { MenuItem, Dropdown, renderGrouped, blockTypeItem } from 'prosemirror-menu';
import { undo, redo } from 'prosemirror-history';
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
  deleteTable,
} from 'prosemirror-tables';
import openPrompt from '../../da-palette/da-palette.js';
import openLibrary from '../../da-library/da-library.js';

import insertTable from '../table.js';

const { getLibs } = await import('../../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);

function canInsert(state, nodeType) {
  const { $from } = state.selection;
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
  for (const prop in options) {
    passedOptions[prop] = options[prop];
    if (!options.enable && !options.select) {
      passedOptions[options.enable ? 'enable' : 'select'] = (state) => cmd(state);
    }
  }
  return new MenuItem(passedOptions);
}

function wrapListItem(nodeType, options) {
  return cmdItem(wrapInList(nodeType, options.attrs), options);
}

function markActive(state, type) {
  const { from, to, $from, $to, empty } = state.selection;
  if (empty) {
    return !!type.isInSet(state.storedMarks || $from.marksAcross($to) || []);
  } else {
    return state.doc.rangeHasMark(from, to, type);
  }
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
    }
  };
}

function findExistingLink(state, linkMarkType) {
  const { $from, $to, empty } = state.selection;
  if(empty) {
    const { node, offset } = $from.parent.childAfter($from.parentOffset);
    return {
      link: node,
      offset,
    };
  } else {
    let result;
    $from.parent.nodesBetween($from.parentOffset, $to.parentOffset, (node, pos, parent, index) => {
      if (linkMarkType.isInSet(node.marks)) {
        result = {
          link: node,
          offset: pos,
        };
      }
    });
    return result;
  }
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

  let lastPrompt = {
    isOpen: () => false,
  };
  
  return new MenuItem({
    title: 'Add or Edit link',
    label,
    class: 'edit-link',
    active(state) { return markActive(state, linkMarkType); },
    enable(state) { return state.selection.content().content.childCount <= 1 && (!state.selection.empty || this.active(state)); },
    run(initialState, dispatch, view) {
      if(lastPrompt.isOpen()) {
        lastPrompt.focus();
        return;
      }

      const fields = defaultLinkFields();
      
      let existingLink, existingLinkOffset;
      if (this.active(view.state)) {
        let existingLinkMark;
        ({ link: existingLink, offset: existingLinkOffset } = findExistingLink(view.state, linkMarkType));
        existingLinkMark = existingLink && existingLink.marks.find((mark) => mark.type.name === linkMarkType.name)
        if(existingLinkMark) {
          fields.href.value = existingLinkMark.attrs.href;
          fields.title.value = existingLinkMark.attrs.title;
        }
      }

      const { $from, $to } = view.state.selection;
      
      let start, end;
      if(this.active(view.state)) {
        ({ start, end } = calculateLinkPosition(view.state, existingLink, existingLinkOffset));
      } else {
        start = $from.pos;
        end = $to.pos;
      }

      dispatch(view.state.tr.addMark(start, end, view.state.schema.marks.contextHighlightingMark.create({})).setMeta('addToHistory', false));
      
      const callback = (attrs) => {
        const tr = view.state.tr
          .setSelection(TextSelection.create(view.state.doc, start, end));
        if(!!fields.href.value) {
          dispatch(tr.addMark(start, end, linkMarkType.create(attrs)));
        } else if(this.active(view.state)) {
          dispatch(tr.removeMark(start, end, linkMarkType));
        }
        
        view.focus();
      };

      lastPrompt = openPrompt({ title: label, fields, callback });
      lastPrompt.addEventListener('closed', () => {
        dispatch(view.state.tr.removeMark(start, end, view.state.schema.marks.contextHighlightingMark).setMeta('addToHistory', false));
      });
    }
  });
}

function removeLinkItem(linkMarkType) {
  return new MenuItem({
    title: 'Remove link',
    label: 'Remove Link',
    class: 'edit-unlink',
    active(state) { return markActive(state, linkMarkType); },
    enable(state) { return this.active(state); },
    run(state, dispatch, view) {
      const { link, offset } = findExistingLink(state);
      const { start, end } = calculateLinkPosition(state, link, offset);
      const tr = state.tr.setSelection(TextSelection.create(state.doc, start, end))
        .removeMark(start, end, linkMarkType);
      dispatch(tr);
    }
  });
}

function libraryItem(menu, markType) {
  const label = 'Library';
  return new MenuItem({
    title: "Open library",
    label,
    class: 'insert-table',
    run(state, dispatch, view) {
      const callback = (attrs) => {
        view.focus();
      }
      openLibrary({ callback });
    }
  });
}

function markItem(markType, options) {
  const passedOptions = { active(state) { return markActive(state, markType); } };
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

function getTextBlocks(nodes) {
  return [
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

function getMenu(view) {
  const menu = createTag('div', { class: 'ProseMirror-menubar' });

  const { marks, nodes } = view.state.schema;
  const editTable = getTableMenu();
  const textBlocks = getTextBlocks(nodes);

  const textMenu = [
    new Dropdown(textBlocks, {
      label: 'Edit Text',
      class: 'edit-text',
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
    linkItem(marks.link),
    removeLinkItem(marks.link),
  ];

  const listMenu = [
    wrapListItem(nodes.bullet_list, {
      title: 'Wrap in bullet list',
      label: 'List',
      class: 'edit-list',
    }),
  ];

  const blockMenu = [
    new MenuItem({
      title: 'Open library',
      label: 'Library',
      enable() { return true; },
      run() { openLibrary(); },
      class: 'open-library',
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
      focus: (view, event) => {
        view.root.querySelectorAll('da-palette').forEach((palette) => {
          palette.updateSelection();
        });
      }
    }
  },
  view: (view) => {
    const { menu, update } = getMenu(view);
    const palettes = createTag('div', { class: 'da-palettes' });
    view.dom.insertAdjacentElement('beforebegin', menu);
    view.dom.insertAdjacentElement('afterend', palettes);
    update(view.state);
    return { update: (view) => update(view.state) };
  },
});
