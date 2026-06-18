/* eslint-disable import/no-unresolved -- importmap */
import {
  Fragment,
  liftListItem,
  setBlockType,
  sinkListItem,
  TextSelection,
  toggleMark,
  wrapIn,
  wrapInList,
  addColumnBefore,
  addColumnAfter,
  addRowBefore,
  addRowAfter,
  deleteColumn,
  deleteRow,
  mergeCells,
  splitCell,
  isInTable,
} from 'da-y-wrapper';

/* ---- Apply factories ---- */

export const blockType = (nodeKey, attrs) => (view) => {
  const { state } = view;
  setBlockType(state.schema.nodes[nodeKey], attrs)(state, view.dispatch.bind(view));
};

export const wrap = (nodeKey) => (view) => {
  const { state } = view;
  wrapIn(state.schema.nodes[nodeKey])(state, view.dispatch.bind(view));
};

export const list = (nodeKey) => (view) => {
  const { state } = view;
  wrapInList(state.schema.nodes[nodeKey])(state, view.dispatch.bind(view));
};

export const inlineMark = (markKey) => (view) => {
  const { state } = view;
  toggleMark(state.schema.marks[markKey])(state, view.dispatch.bind(view));
};

export const sinkListLevel = (view) => {
  const { state } = view;
  sinkListItem(state.schema.nodes.list_item)(state, view.dispatch.bind(view));
};

export const liftListLevel = (view) => {
  const { state } = view;
  liftListItem(state.schema.nodes.list_item)(state, view.dispatch.bind(view));
};

/* ---- Active queries ---- */

export function markIsActive(state, markName) {
  const mark = state.schema.marks[markName];
  if (!mark) return false;
  const { selection, storedMarks } = state;
  if (selection.empty) {
    return (storedMarks || selection.$from.marks()).some((m) => m.type === mark);
  }
  return state.doc.rangeHasMark(selection.from, selection.to, mark);
}

export function inBlockquote($pos) {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'blockquote') return true;
  }
  return false;
}

export function nearestListType($pos) {
  for (let d = $pos.depth; d > 0; d -= 1) {
    const { name } = $pos.node(d).type;
    if (name === 'bullet_list' || name === 'ordered_list') return name;
  }
  return null;
}

export function inList($pos) {
  return nearestListType($pos) !== null;
}

export function canSinkList(state) {
  return sinkListItem(state.schema.nodes.list_item)(state);
}

export function canLiftList(state) {
  return liftListItem(state.schema.nodes.list_item)(state);
}

/* ---- Table commands ---- */

export const tableCommand = (cmd) => (view) => {
  cmd(view.state, view.dispatch.bind(view));
};

export const addTableColumnLeft = tableCommand(addColumnBefore);
export const addTableColumnRight = tableCommand(addColumnAfter);
export const addTableRowAbove = tableCommand(addRowBefore);
export const addTableRowBelow = tableCommand(addRowAfter);
export const deleteTableColumn = tableCommand(deleteColumn);
export const deleteTableRow = tableCommand(deleteRow);
export const mergeTableCells = tableCommand(mergeCells);
export const splitTableCell = tableCommand(splitCell);

export function inTable(state) {
  return isInTable(state);
}

export function canMergeCells(state) {
  return mergeCells(state);
}

export function canSplitCell(state) {
  return splitCell(state);
}

/* ---- Slash-only action helpers ---- */

export function getTableHeading(schema) {
  // eslint-disable-next-line camelcase
  const { paragraph, table_row, table_cell } = schema.nodes;
  const para = paragraph.create(null, schema.text('columns'));
  // eslint-disable-next-line camelcase
  return table_row.create(null, Fragment.from(table_cell.create({ colspan: 2 }, para)));
}

export function getTableBody(schema) {
  const cell = schema.nodes.table_cell.createAndFill();
  return schema.nodes.table_row.create(null, Fragment.fromArray([cell, cell]));
}

export const LOREM_SENTENCES = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
  'Nunc feugiat mi a tellus consequat imperdiet.',
  'Vestibulum sapien proin quam etiam ultrices suscipit gravida bibendum.',
  'Fusce pellentesque enim aliquam varius tincidunt aenean vulputate.',
  'Maecenas volutpat blandit aliquam etiam erat velit scelerisque in dictum.',
];

/* ---- Selection queries ---- */

export function isImageNodeSelected({ selection }) {
  return selection?.node?.type.name === 'image';
}

/* ---- Link queries ---- */

function findLinkInRange(state) {
  const { from, to } = state.selection;
  const linkType = state.schema.marks.link;

  if (from === to) {
    // Empty selection: scan parent node children to find a link that contains the cursor.
    const $pos = state.doc.resolve(from);
    const { parent } = $pos;
    const parentStart = $pos.start();
    let result = null;
    parent.forEach((node, offset) => {
      if (result) return;
      const mark = linkType.isInSet(node.marks);
      if (!mark) return;
      const nodeFrom = parentStart + offset;
      const nodeTo = nodeFrom + node.nodeSize;
      if (nodeFrom <= from && from < nodeTo) {
        result = { node, mark, from: nodeFrom, to: nodeTo };
      }
    });
    return result;
  }

  let found;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (found) return false;
    const mark = linkType.isInSet(node.marks);
    if (mark) { found = { node, mark, from: pos, to: pos + node.nodeSize }; }
    return true;
  });
  return found ?? null;
}

export function selectionHasLink(state) {
  if (isImageNodeSelected(state)) {
    return Boolean(state.selection.node.attrs.href);
  }
  return findLinkInRange(state) !== null;
}

export function getLinkInfoInSelection(state) {
  if (isImageNodeSelected(state)) {
    const { node, from, to } = state.selection;
    if (!node.attrs.href) return null;
    return {
      href: node.attrs.href,
      title: node.attrs.title ?? '',
      text: '',
      from,
      to,
    };
  }
  const result = findLinkInRange(state);
  if (!result) return null;
  return {
    href: result.mark.attrs.href ?? '',
    title: result.mark.attrs.title ?? '',
    text: result.node.textContent,
    from: result.from,
    to: result.to,
  };
}

/* ---- Link commands ---- */

export function applyLink(view, { href, text }) {
  const { state } = view;
  const trimmedHref = href.trim();

  if (isImageNodeSelected(state)) {
    const { from } = state.selection;
    view.dispatch(state.tr.setNodeAttribute(from, 'href', trimmedHref || null));
    return;
  }

  const { schema, selection } = state;
  const linkType = schema.marks.link;
  let { from, to } = selection;
  let { tr } = state;

  const existingLink = findLinkInRange(state);
  if (existingLink) {
    ({ from, to } = existingLink);
    tr = tr.removeMark(from, to, linkType);
  }

  const displayText = text?.trim() || trimmedHref;
  const originalText = state.doc.textBetween(from, to);

  if (displayText !== originalText || from === to) {
    const marks = from < state.doc.content.size
      ? state.doc.resolve(from).marks().filter((m) => m.type !== linkType)
      : [];
    const textNode = schema.text(displayText, marks);
    tr = tr.replaceWith(from, to, textNode);
    to = from + displayText.length;
  }

  tr = tr.addMark(from, to, linkType.create({ href: trimmedHref }));
  tr = tr.setSelection(TextSelection.create(tr.doc, to));
  view.dispatch(tr);
}

export function removeLink(view) {
  const { state } = view;

  if (isImageNodeSelected(state)) {
    const { from } = state.selection;
    view.dispatch(
      state.tr.setNodeAttribute(from, 'href', null).setNodeAttribute(from, 'title', null),
    );
    return;
  }

  const linkType = state.schema.marks.link;
  const found = findLinkInRange(state);
  if (!found) return;
  const { tr } = state;
  tr.removeMark(found.from, found.to, linkType);
  view.dispatch(tr);
}

/* ---- Block-type picker value ---- */

const SCHEMA_NODE_TO_ID = new Map([
  ['paragraph', 'paragraph'],
  ['code_block', 'code-block'],
]);

function forEachTextblockInSelection({ doc, selection }, visit) {
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.isTextblock) {
      visit(node);
      return false;
    }
    return true;
  });
}

export function getBlockTypePickerValue(state) {
  const keys = [];
  forEachTextblockInSelection(state, (node) => {
    if (node.type.name === 'heading') {
      keys.push(`heading-${node.attrs.level}`);
    } else {
      keys.push(SCHEMA_NODE_TO_ID.get(node.type.name) ?? node.type.name);
    }
  });
  const uniq = [...new Set(keys)];
  if (uniq.length === 0) return 'paragraph';
  if (uniq.length > 1) return 'mixed';
  return uniq[0];
}
