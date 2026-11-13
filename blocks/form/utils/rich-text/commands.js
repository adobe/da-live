import { safeHref } from '../safe-href.js';
import { childrenAt } from './nodes.js';
import { HEADING_LEVELS, LIST_NAMES } from './schema.js';

/**
 * A ProseMirror command. Without `dispatch` it only answers whether it applies.
 * @typedef {(state: object, dispatch?: (transaction: object) => void) => boolean} RichTextCommand
 */

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
 * Runs a command without applying it.
 * @param {RichTextCommand} command The command.
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
 * @param {object} options The style.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {string} options.value The value of the text style, see `BLOCK_TYPES`.
 * @returns {RichTextCommand} The command.
 */
export function setBlock({ proseMirror, value }) {
  return (state, dispatch) => {
    const block = BLOCK_TYPES.find((type) => type.value === value);
    if (!block) {
      return false;
    }
    return proseMirror.setBlockType(state.schema.nodes[block.node], block.attrs)(state, dispatch);
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
 * Creates a command that wraps the selection in a blockquote, or lifts it out of one.
 * @param {object} options The dependencies.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @returns {RichTextCommand} The command.
 */
export function toggleBlockquote({ proseMirror }) {
  return (state, dispatch) => {
    const type = state.schema.nodes.blockquote;
    if (!isInBlockquote(state)) {
      return proseMirror.wrapIn(type)(state, dispatch);
    }

    const { $from, $to } = state.selection;
    const range = $from.blockRange($to, (node) => node.type === type);
    if (!range) {
      return false;
    }

    dispatch?.(state.tr.lift(range, range.depth - 1).scrollIntoView());
    return true;
  };
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
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {string} options.href The link, which must pass `safeHref`.
 * @param {string} [options.text] The text to show, the href when empty.
 * @param {string} [options.title] The title of the link.
 * @returns {RichTextCommand} The command.
 */
export function applyLink({ proseMirror, href, text, title }) {
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
    transaction.setSelection(proseMirror.TextSelection.create(transaction.doc, end));
    dispatch(transaction.scrollIntoView());
    return true;
  };
}

/**
 * Removes the links in the selection, or the link at the cursor.
 * @type {RichTextCommand}
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
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {object} options.state The editor state the position refers to.
 * @param {object} options.transaction The transaction that collects the steps.
 * @param {number} options.position The position inside the item's paragraph.
 * @returns {object} The editor state after the lift.
 */
function liftOutOfLists({ proseMirror, state, transaction, position }) {
  const itemType = state.schema.nodes.list_item;
  const resolvedPosition = state.doc.resolve(position);
  if (resolvedPosition.depth < 2 || resolvedPosition.node(-1).type !== itemType) {
    return state;
  }

  const caret = proseMirror.TextSelection.create(state.doc, position);
  const selected = state.apply(state.tr.setSelection(caret));
  const lifted = dryRun(proseMirror.liftListItem(itemType), selected);
  if (!lifted) {
    return state;
  }

  lifted.steps.forEach((step) => transaction.step(step));
  const next = selected.apply(lifted);
  return liftOutOfLists({ proseMirror, state: next, transaction, position: next.selection.from });
}

/**
 * Creates a command that lifts the selected list items out of their lists. List items only
 * hold a paragraph and nested lists, so items are lifted one at a time.
 * @param {object} options The dependencies.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @returns {RichTextCommand} The command.
 */
export function unwrapListItems({ proseMirror }) {
  return (state, dispatch) => {
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
      return liftOutOfLists({ proseMirror, state: current, transaction, position });
    };
    const lifted = [...starts].reverse().reduce(lift, state);
    if (!transaction.docChanged) {
      return false;
    }

    if (state.selection.empty) {
      const caret = proseMirror.TextSelection.create(transaction.doc, lifted.selection.from);
      transaction.setSelection(caret);
    }
    dispatch(transaction);
    return true;
  };
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
 * @returns {RichTextCommand} The command.
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
 * @param {object} options The list.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {string} options.name The list node name, see `LIST_NAMES`.
 * @returns {RichTextCommand} The command.
 */
export function toggleList({ proseMirror, name }) {
  return (state, dispatch) => {
    const listType = state.schema.nodes[name];
    const current = getListType(state);
    if (current?.name === name) {
      return unwrapListItems({ proseMirror })(state, dispatch);
    }
    if (current) {
      dispatch?.(state.tr.setNodeMarkup(state.selection.$from.before(current.depth), listType));
      return true;
    }
    return proseMirror.wrapInList(listType)(state, dispatch)
      || wrapBlocksInList(listType)(state, dispatch);
  };
}

/**
 * Replaces the selection with a line break.
 * @type {RichTextCommand}
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
 * @returns {RichTextCommand} The command.
 */
export function requestLink({ onLink }) {
  return (state, dispatch) => {
    if (dispatch) {
      onLink();
    }
    return true;
  };
}
