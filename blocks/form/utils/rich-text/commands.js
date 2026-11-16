import {
  liftListItem,
  setBlockType,
  TextSelection,
  wrapIn,
  wrapInList,
} from 'da-y-wrapper';
import { safeHref } from '../safe-href.js';

/** The levels of the heading text styles. */
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

/** The names of the list nodes. */
const LIST_NAMES = new Set(['bullet_list', 'ordered_list']);

/**
 * Lists the children of a node with their document positions.
 * @param {object} parent The ProseMirror node.
 * @param {number} [start] The position of the start of its content.
 * @returns {{ node: object, position: number }[]} The child nodes and their positions.
 */
function childrenAt(parent, start = 0) {
  const children = [];
  parent.forEach((node, offset) => children.push({ node, position: start + offset }));
  return children;
}

/**
 * Lists the ancestors of a position, innermost first.
 * @param {object} resolvedPosition The resolved ProseMirror position.
 * @returns {{ node: object, depth: number }[]} The ancestor nodes and their depths.
 */
function ancestors(resolvedPosition) {
  return Array.from({ length: resolvedPosition.depth }, (_, index) => {
    const depth = resolvedPosition.depth - index;
    return { node: resolvedPosition.node(depth), depth };
  });
}

/**
 * Runs a command without applying it and returns the transaction it would dispatch.
 *
 * Needed to chain built-in commands into one change. Each command must see the result of
 * the previous one, but the editor should only apply the combined result once, as a single
 * transaction and value change. A command only hands its transaction to `dispatch`, so
 * catching it there gives its steps to collect and the next state to run the next one on.
 * @param {Function} command The ProseMirror command.
 * @param {object} state The editor state.
 * @returns {object|undefined} The transaction it dispatched, or undefined when it did not.
 */
function dryRun(command, state) {
  const transactions = [];
  command(state, (transaction) => transactions.push(transaction));
  return transactions[0];
}

/**
 * Lists the marks new text gets at a range. An empty range uses the stored marks.
 * @param {object} options The range.
 * @param {object} options.state The editor state.
 * @param {number} options.from The start of the range.
 * @param {number} options.to The end of the range.
 * @returns {object[]} The ProseMirror marks.
 */
function marksAt({ state, from, to }) {
  if (from === to) {
    return state.storedMarks ?? state.selection.$from.marks();
  }
  return state.doc.nodeAt(from)?.marks ?? [];
}

/**
 * Lists the marks of the selection. A range has a mark when any of its text has it.
 * @param {object} state The editor state.
 * @returns {Set<string>} The mark names.
 */
export function getActiveMarks(state) {
  const { doc, schema, selection: { from, to, empty } } = state;
  const current = empty ? marksAt({ state, from, to }) : null;
  return new Set(Object.values(schema.marks)
    .filter((type) => (empty ? !!type.isInSet(current) : doc.rangeHasMark(from, to, type)))
    .map((type) => type.name));
}

/**
 * The text styles of the picker.
 * @type {{ value: string, label: string, node: string, attrs?: object }[]}
 */
export const BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph', node: 'paragraph' },
  ...HEADING_LEVELS.map((level) => ({
    value: `heading-${level}`,
    label: `Heading ${level}`,
    node: 'heading',
    attrs: { level },
  })),
];

/**
 * Reads the text style at the selection start.
 * @param {object} state The editor state.
 * @returns {string|null} The value of the text style, or null in other blocks.
 */
export function getBlockType(state) {
  const { parent } = state.selection.$from;
  const { nodes } = state.schema;
  return BLOCK_TYPES.find(({ node, attrs }) => parent.hasMarkup(nodes[node], attrs))?.value ?? null;
}

/**
 * Creates a command that changes the text style of the selected blocks.
 * @param {string} value The value of the text style, see `BLOCK_TYPES`.
 * @returns {Function} The ProseMirror command.
 */
export function setBlock(value) {
  return (state, dispatch) => {
    const block = BLOCK_TYPES.find((type) => type.value === value);
    if (!block) {
      return false;
    }
    return setBlockType(state.schema.nodes[block.node], block.attrs)(state, dispatch);
  };
}

/**
 * Answers whether the selection start is in a blockquote.
 * @param {object} state The editor state.
 * @returns {boolean} Whether a blockquote holds the selection.
 */
export function isInBlockquote(state) {
  return ancestors(state.selection.$from).some(({ node }) => node.type.name === 'blockquote');
}

/**
 * Wraps the selection in a blockquote, or lifts it out of one.
 */
export function toggleBlockquote(state, dispatch) {
  const type = state.schema.nodes.blockquote;
  if (!isInBlockquote(state)) {
    return wrapIn(type)(state, dispatch);
  }

  const { $from, $to } = state.selection;
  const range = $from.blockRange($to, (node) => node.type === type);
  if (!range) {
    return false;
  }

  dispatch?.(state.tr.lift(range, range.depth - 1).scrollIntoView());
  return true;
}

/**
 * Finds the ranges of neighbouring children of a block that share a mark.
 * @param {object} options The block and the mark.
 * @param {object} options.parent The ProseMirror block.
 * @param {number} options.start The position of the start of its content.
 * @param {object} options.mark The ProseMirror mark.
 * @returns {{ from: number, to: number }[]} The ranges.
 */
function markRuns({ parent, start, mark }) {
  return childrenAt(parent, start)
    .filter(({ node }) => mark.isInSet(node.marks))
    .reduce((runs, { node, position }) => {
      const last = runs.at(-1);
      const to = position + node.nodeSize;
      if (last?.to === position) {
        return [...runs.slice(0, -1), { from: last.from, to }];
      }
      return [...runs, { from: position, to }];
    }, []);
}

/**
 * Finds the link at the selection start.
 * @param {object} state The editor state.
 * @returns {{ href: string, title: string, from: number, to: number }|null} The link and
 *   its range, or null when there is none.
 */
export function getLinkAt(state) {
  const { $from, from, to } = state.selection;
  const mark = state.schema.marks.link.isInSet(marksAt({ state, from, to }));
  if (!mark) {
    return null;
  }

  const range = markRuns({ parent: $from.parent, start: $from.start(), mark })
    .find((run) => run.from <= from && from <= run.to);
  if (!range) {
    return null;
  }

  const { href, title } = mark.attrs;
  return { href, title: title ?? '', ...range };
}

/**
 * Grows the selection to cover the link at its start.
 * @param {object} state The editor state.
 * @param {ReturnType<typeof getLinkAt>} [link] The link at the selection start.
 * @returns {{ from: number, to: number }} The range a link applies to.
 */
function linkRange(state, link = getLinkAt(state)) {
  const { from, to } = state.selection;
  if (!link) {
    return { from, to };
  }
  return { from: Math.min(from, link.from), to: Math.max(to, link.to) };
}

/**
 * Reads what the link dialog starts with.
 * @param {object} state The editor state.
 * @returns {{ href: string, title: string, text: string }} The link at the selection, and
 *   the text it applies to.
 */
export function getLinkDraft(state) {
  const link = getLinkAt(state);
  const { from, to } = linkRange(state, link);
  return {
    href: link?.href ?? '',
    title: link?.title ?? '',
    text: state.doc.textBetween(from, to, ' '),
  };
}

/**
 * Creates a command that links the selection, or the link at its start. Changed text
 * replaces the linked text, an empty selection inserts it.
 * @param {object} options The link.
 * @param {string} options.href The link, which must pass `safeHref`.
 * @param {string} [options.text] The text to show, the href when empty.
 * @param {string} [options.title] The title of the link.
 * @returns {Function} The ProseMirror command.
 */
export function applyLink({ href, text, title }) {
  return (state, dispatch) => {
    const safe = safeHref(href);
    if (!safe) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    const type = state.schema.marks.link;
    const { from, to } = linkRange(state);
    const display = text?.trim() || safe;
    const keepsText = from !== to && display === state.doc.textBetween(from, to, ' ');
    const end = keepsText ? to : from + display.length;
    const transaction = state.tr.removeMark(from, to, type);
    if (!keepsText) {
      const marks = type.removeFromSet(marksAt({ state, from, to }));
      transaction.replaceWith(from, to, state.schema.text(display, marks));
    }

    transaction.addMark(from, end, type.create({ href: safe, title: title?.trim() || null }));
    transaction.setSelection(TextSelection.create(transaction.doc, end));
    dispatch(transaction.scrollIntoView());
    return true;
  };
}

/**
 * Removes the links in the selection, or the link at the cursor.
 */
export function removeLink(state, dispatch) {
  const type = state.schema.marks.link;
  const { from, to, empty } = state.selection;
  const range = empty ? getLinkAt(state) : { from, to };
  if (!range || !state.doc.rangeHasMark(range.from, range.to, type)) {
    return false;
  }

  dispatch?.(state.tr.removeMark(range.from, range.to, type).scrollIntoView());
  return true;
}

/**
 * Finds the innermost list at the selection start.
 * @param {object} state The editor state.
 * @returns {{ name: string, depth: number }|null} The list node name and depth, or null
 *   outside lists.
 */
export function getListType(state) {
  const list = ancestors(state.selection.$from).find(({ node }) => LIST_NAMES.has(node.type.name));
  return list ? { name: list.node.type.name, depth: list.depth } : null;
}

/**
 * Lifts the list item at a position out of every list around it, adding the steps to `transaction`.
 * @param {object} options The item.
 * @param {object} options.state The editor state the position refers to.
 * @param {object} options.transaction The transaction that collects the steps.
 * @param {number} options.position The position inside the item's paragraph.
 * @returns {object} The editor state after the lift.
 */
function liftOutOfLists({ state, transaction, position }) {
  const itemType = state.schema.nodes.list_item;
  const resolvedPosition = state.doc.resolve(position);
  if (resolvedPosition.depth < 2 || resolvedPosition.node(-1).type !== itemType) {
    return state;
  }

  const caret = TextSelection.create(state.doc, position);
  const selected = state.apply(state.tr.setSelection(caret));
  const lifted = dryRun(liftListItem(itemType), selected);
  if (!lifted) {
    return state;
  }

  lifted.steps.forEach((step) => transaction.step(step));
  const next = selected.apply(lifted);
  return liftOutOfLists({ state: next, transaction, position: next.selection.from });
}

/**
 * Lifts the selected list items out of their lists. List items only hold a paragraph and
 * nested lists, so items are lifted one at a time.
 */
function unwrapListItems(state, dispatch) {
  const { from, to } = state.selection;
  const itemType = state.schema.nodes.list_item;
  const starts = [];
  state.doc.nodesBetween(from, to, (node, position, parent) => {
    if (node.type.name === 'paragraph' && parent?.type === itemType) {
      starts.push(position + 1);
    }
  });
  if (!starts.length) {
    return false;
  }
  if (!dispatch) {
    return true;
  }

  const transaction = state.tr.scrollIntoView();
  const lift = (current, start) => {
    const position = transaction.mapping.map(start);
    return liftOutOfLists({ state: current, transaction, position });
  };
  const lifted = [...starts].reverse().reduce(lift, state);
  if (!transaction.docChanged) {
    return false;
  }

  if (state.selection.empty) {
    const caret = TextSelection.create(transaction.doc, lifted.selection.from);
    transaction.setSelection(caret);
  }
  dispatch(transaction);
  return true;
}

/**
 * Turns a block into a list of the given type, adding the steps to `transaction`.
 * @param {object} options The block and the list.
 * @param {object} options.transaction The transaction that collects the steps.
 * @param {object} options.listType The ProseMirror node type of the list.
 * @param {{ node: object, position: number }} options.block The block and its position.
 */
function wrapBlock({ transaction, listType, block: { node, position } }) {
  const { nodes } = listType.schema;
  if (node.type === listType) {
    return;
  }
  if (LIST_NAMES.has(node.type.name)) {
    transaction.setNodeMarkup(position, listType);
    return;
  }

  if (node.type !== nodes.paragraph) {
    transaction.setNodeMarkup(position, nodes.paragraph);
  }
  const range = transaction.doc.resolve(position + 1).blockRange();
  transaction.wrap(range, [{ type: listType }, { type: nodes.list_item }]);
}

/**
 * Creates a command that turns the selected blocks into one list. List items hold a single
 * paragraph, so each block is wrapped on its own and the lists are joined.
 * @param {object} listType The ProseMirror node type of the list.
 * @returns {Function} The ProseMirror command.
 */
function wrapBlocksInList(listType) {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range?.parent.canReplaceWith(range.startIndex, range.endIndex, listType)) {
      return false;
    }

    const blocks = childrenAt(range.parent, range.$from.start(range.depth))
      .slice(range.startIndex, range.endIndex);
    if (!blocks.every(({ node }) => node.isTextblock || LIST_NAMES.has(node.type.name))) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    const transaction = state.tr.scrollIntoView();
    [...blocks].reverse().forEach((block) => wrapBlock({ transaction, listType, block }));
    const resolvedStart = transaction.doc.resolve(range.start);
    childrenAt(resolvedStart.parent, resolvedStart.start())
      .slice(range.startIndex + 1, range.endIndex)
      .reverse()
      .forEach(({ position }) => transaction.join(position));
    dispatch(transaction);
    return true;
  };
}

/**
 * Creates a command that turns the selection into a list, switches the list type, or lifts
 * the items out of a list of the same type.
 * @param {string} name The list node name, see `LIST_NAMES`.
 * @returns {Function} The ProseMirror command.
 */
export function toggleList(name) {
  return (state, dispatch) => {
    const listType = state.schema.nodes[name];
    const current = getListType(state);

    // The SDK stores a list item as one line, so the schema allows a single paragraph per
    // item. ProseMirror's wrapInList and liftListItem briefly put several blocks into one item
    // when they handle a multi-block selection, which this schema rejects. unwrapListItems and
    // wrapBlocksInList wrap and lift each block on its own instead.

    if (current?.name === name) {
      return unwrapListItems(state, dispatch);
    }
    if (current) {
      dispatch?.(state.tr.setNodeMarkup(state.selection.$from.before(current.depth), listType));
      return true;
    }
    return wrapInList(listType)(state, dispatch)
      || wrapBlocksInList(listType)(state, dispatch);
  };
}

/**
 * Replaces the selection with a line break.
 */
export function insertHardBreak(state, dispatch) {
  const hardBreak = state.schema.nodes.hard_break.create();
  dispatch?.(state.tr.replaceSelectionWith(hardBreak).scrollIntoView());
  return true;
}

/**
 * Creates a command that asks for the link dialog, which applies anywhere.
 * @param {object} options The dialog.
 * @param {() => void} options.onLink Opens the link dialog.
 * @returns {Function} The ProseMirror command.
 */
export function requestLink({ onLink }) {
  return (state, dispatch) => {
    if (dispatch) {
      onLink();
    }
    return true;
  };
}
