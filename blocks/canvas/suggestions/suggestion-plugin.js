/* eslint-disable import/no-unresolved -- importmap */
import {
  Plugin,
  Mapping,
  Decoration,
  DecorationSet,
  ySyncPluginKey,
} from 'da-y-wrapper';
import {
  suggestionModePlugin,
  suggestionPluginKey,
  suggestionTransactionKey,
  setSuggestionMode,
} from '../../../deps/prosemirror-suggestion-mode/dist/index.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getSlashContext } from '../editor-utils/slash-context.js';

export { suggestionPluginKey, suggestionTransactionKey };

export const NOT_WHILE_SUGGESTING = 'Not available while suggesting. Turn off Suggesting to edit.';

const SUGGESTION_MARKS = ['suggestion_insert', 'suggestion_delete'];

// y-prosemirror only keeps marks on text, so images and blocks carry their suggestion as attrs.
const NODE_SUGGESTION_TYPES = new Set(['image', 'table']);

const suggestionMarkOf = (node) => node.marks.find((m) => SUGGESTION_MARKS.includes(m.type.name));

const nodeSuggestion = (node) => (
  NODE_SUGGESTION_TYPES.has(node.type.name) ? node.attrs.suggestion : null
);

function suggestionAttrs(node, suggestion, username) {
  return {
    ...node.attrs,
    suggestion,
    suggestionUsername: suggestion ? username : null,
    suggestionCreatedAt: suggestion ? String(Date.now()) : null,
  };
}

export function isSuggesting(state) {
  return Boolean(suggestionPluginKey.getState(state)?.inSuggestionMode);
}

export function hasPendingSuggestion(node) {
  if (nodeSuggestion(node) || (node.isText && suggestionMarkOf(node))) return true;
  let found = false;
  node.descendants((child) => {
    if (nodeSuggestion(child) || (child.isText && suggestionMarkOf(child))) found = true;
    return !found;
  });
  return found;
}

export function setSuggesting(view, on) {
  setSuggestionMode(view, on);
}

export function toggleSuggesting(view) {
  setSuggestionMode(view, !isSuggesting(view.state));
  return true;
}

// Replacing text records a deletion immediately followed by an insertion. They are
// one edit to the author, so resolve by contiguous run rather than by what the
// selection happens to cover — otherwise accepting the insertion strands the deletion.
function suggestionRuns(doc) {
  const runs = [];
  let current = null;
  doc.descendants((node, pos) => {
    if (nodeSuggestion(node)) {
      current = null;
      return false;
    }
    if (!node.isText) return true;
    if (!suggestionMarkOf(node)) {
      current = null;
      return true;
    }
    if (current?.to === pos) {
      current.to = pos + node.nodeSize;
      return true;
    }
    current = { from: pos, to: pos + node.nodeSize };
    runs.push(current);
    return true;
  });
  return runs;
}

export function inPendingNode($pos) {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if (nodeSuggestion($pos.node(d))) return true;
  }
  return false;
}

function isEmptyGap(doc, from, to) {
  if (from === to) return true;
  if (from > to) return false;
  let empty = true;
  doc.slice(from, to).content.forEach((node) => {
    if (!node.isTextblock || node.content.size > 0) empty = false;
  });
  return empty;
}

// A replaced image or block is its deletion followed by the insertion; pair them into one unit.
function nodeUnits(doc) {
  const units = [];
  doc.descendants((node, pos) => {
    const suggestion = nodeSuggestion(node);
    if (!suggestion) return true;
    const part = { from: pos, to: pos + node.nodeSize, node, suggestion };
    const prev = units[units.length - 1];
    const pairs = prev?.parts.length === 1
      && prev.parts[0].suggestion === 'delete'
      && suggestion === 'insert'
      && prev.parts[0].node.type === node.type
      && isEmptyGap(doc, prev.to, part.from);
    if (pairs) {
      prev.parts.push(part);
      prev.to = part.to;
    } else {
      units.push({ from: part.from, to: part.to, parts: [part] });
    }
    return false;
  });
  return units;
}

function suggestionUnits(doc) {
  return [...suggestionRuns(doc), ...nodeUnits(doc)].sort((a, b) => a.from - b.from);
}

function suggestionRange(state) {
  const { from, to } = state.selection;
  const hits = suggestionUnits(state.doc).filter((unit) => unit.from <= to && unit.to >= from);
  if (!hits.length) return null;
  return {
    from: Math.min(...hits.map((unit) => unit.from)),
    to: Math.max(...hits.map((unit) => unit.to)),
  };
}

export function selectionHasSuggestion(state) {
  return suggestionRange(state) != null;
}

export { suggestionRange };

function runText(doc, run) {
  let deleted = '';
  let inserted = '';
  let username = '';
  let createdAt = null;
  doc.nodesBetween(run.from, run.to, (node) => {
    if (!node.isText) return;
    const mark = suggestionMarkOf(node);
    if (!mark) return;
    if (mark.type.name === 'suggestion_delete') deleted += node.text ?? '';
    else inserted += node.text ?? '';
    if (!username) username = mark.attrs.username || '';
    if (createdAt == null) createdAt = mark.attrs.createdAt ?? null;
  });
  return { deleted, inserted, username, createdAt };
}

function suggestionKind({ deleted, inserted }) {
  if (deleted && inserted) return 'replace';
  return deleted ? 'delete' : 'insert';
}

const blockLabel = (node) => node.firstChild?.firstChild?.textContent.trim() || 'block';

const imageLabel = (node) => node.attrs.alt
  || node.attrs.src?.split('/').pop()?.split('?')[0]
  || 'image';

function describeNodeUnit(unit) {
  const [first] = unit.parts;
  const subject = first.node.type.name === 'table' ? 'block' : 'image';
  const label = subject === 'block' ? blockLabel : imageLabel;
  const named = (suggestion) => unit.parts
    .filter((part) => part.suggestion === suggestion)
    .map((part) => label(part.node))
    .join(', ');
  const parts = { deleted: named('delete'), inserted: named('insert') };
  const createdAt = Number(first.node.attrs.suggestionCreatedAt);
  return {
    id: `${unit.from}-${unit.to}`,
    from: unit.from,
    to: unit.to,
    kind: suggestionKind(parts),
    subject,
    ...parts,
    username: first.node.attrs.suggestionUsername || '',
    createdAt: createdAt > 0 ? createdAt : null,
  };
}

export function listSuggestions(doc) {
  return suggestionUnits(doc).map((unit) => {
    if (unit.parts) return describeNodeUnit(unit);
    const parts = runText(doc, unit);
    return {
      id: `${unit.from}-${unit.to}`,
      from: unit.from,
      to: unit.to,
      kind: suggestionKind(parts),
      subject: 'text',
      ...parts,
    };
  });
}

export function suggestionAuthor(state, range) {
  return listSuggestions(state.doc)
    .find((item) => item.from <= range.to && item.to >= range.from)?.username || '';
}

function resolveMarksInside(tr, at, dropped) {
  const ops = [];
  tr.doc.nodeAt(at)?.descendants((child, offset) => {
    if (!child.isText) return true;
    const mark = suggestionMarkOf(child);
    if (mark) ops.push({ mark, from: at + 1 + offset, to: at + 1 + offset + child.nodeSize });
    return true;
  });
  ops.reverse().forEach(({ mark, from, to }) => {
    if (mark.type.name === `suggestion_${dropped}`) tr.delete(from, to);
    else tr.removeMark(from, to, mark.type);
  });
}

function resolveInRange(action, from, to) {
  const dropped = action === 'accept' ? 'delete' : 'insert';
  return (state, dispatch) => {
    const nodes = [];
    const texts = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (nodeSuggestion(node)) {
        nodes.push({ node, pos });
        return false;
      }
      const mark = node.isText && suggestionMarkOf(node);
      if (mark) texts.push({ mark, from: pos, to: pos + node.nodeSize });
      return true;
    });
    if (!nodes.length && !texts.length) return false;
    if (!dispatch) return true;

    const tr = state.tr.setMeta(suggestionTransactionKey, { skipSuggestionOperation: true });
    nodes.forEach(({ node, pos }) => {
      const at = tr.mapping.map(pos);
      const current = tr.doc.nodeAt(at);
      if (!current) return;
      if (node.attrs.suggestion === dropped) {
        tr.delete(at, at + current.nodeSize);
        return;
      }
      tr.setNodeMarkup(at, null, suggestionAttrs(current, null));
      resolveMarksInside(tr, at, dropped);
    });
    texts.forEach(({ mark, from: start, to: end }) => {
      const a = tr.mapping.map(start);
      const b = tr.mapping.map(end);
      if (a >= b) return;
      if (mark.type.name === `suggestion_${dropped}`) tr.delete(a, b);
      else tr.removeMark(a, b, mark.type);
    });
    dispatch(tr);
    return true;
  };
}

export const acceptSuggestionsInRange = (from, to) => resolveInRange('accept', from, to);
export const rejectSuggestionsInRange = (from, to) => resolveInRange('reject', from, to);

export function resolveSuggestion(inRange) {
  return (view) => {
    const range = suggestionRange(view.state);
    if (!range) return false;
    inRange(range.from, range.to)(view.state, view.dispatch);
    return true;
  };
}

function liveTransactions(transactions, oldState) {
  const pluginState = suggestionPluginKey.getState(oldState);
  return transactions.filter((tr) => {
    if (tr.getMeta('history$')) return false;
    const meta = { ...pluginState, ...tr.getMeta(suggestionTransactionKey) };
    return meta.inSuggestionMode && !meta.skipSuggestionOperation;
  });
}

function hasTable(fragment) {
  let found = false;
  fragment.descendants((node) => {
    if (node.type.name === 'table') found = true;
    return !found;
  });
  return found;
}

// The library's paragraph-mark handling can't express a whole block, so steps that add
// or remove a table are tracked here instead.
function collectBlockChanges(transactions, live) {
  const maps = [];
  const changes = [];
  transactions.forEach((tr) => {
    tr.steps.forEach((step, i) => {
      const isReplace = step.slice && !('gapFrom' in step);
      if (isReplace && live.includes(tr)) {
        const removed = tr.docs[i].slice(step.from, step.to);
        changes.push({
          mapIndex: maps.length,
          from: step.from,
          removed,
          insertedSize: step.slice.size,
          touchesTable: hasTable(removed.content) || hasTable(step.slice.content),
        });
      }
      maps.push(step.getMap());
    });
  });
  return changes.some((change) => change.touchesTable) ? { maps, changes } : null;
}

function markRange(tr, from, to, kind, username) {
  const mark = tr.doc.type.schema.marks[`suggestion_${kind}`].create({ username });
  const drop = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (NODE_SUGGESTION_TYPES.has(node.type.name)) {
      if (pos < from || pos + node.nodeSize > to) return true;
      // Removing your own pending insertion just withdraws it.
      if (kind === 'delete' && node.attrs.suggestion === 'insert') drop.push([pos, pos + node.nodeSize]);
      else tr.setNodeMarkup(pos, null, suggestionAttrs(node, kind, username));
      return false;
    }
    if (!node.isText) return true;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    const ownInsert = node.marks.some((m) => m.type.name === 'suggestion_insert');
    if (kind === 'delete' && ownInsert) drop.push([start, end]);
    else tr.addMark(start, end, mark);
    return false;
  });
  drop.reverse().forEach(([start, end]) => tr.delete(start, end));
}

function trackBlockChanges(newState, { maps, changes }, username) {
  const tr = newState.tr.setMeta(suggestionTransactionKey, { skipSuggestionOperation: true });
  changes.forEach((change) => {
    const rest = new Mapping(maps.slice(change.mapIndex + 1));
    const insertedFrom = rest.map(change.from, 1);
    const insertedTo = rest.map(change.from + change.insertedSize, -1);
    if (change.removed.size) {
      // Put the removed content back ahead of whatever replaced it, then mark it.
      const at = tr.mapping.map(rest.map(change.from, -1), -1);
      const sizeBefore = tr.doc.content.size;
      tr.replace(at, at, change.removed);
      markRange(tr, at, at + tr.doc.content.size - sizeBefore, 'delete', username);
    }
    if (insertedTo > insertedFrom) {
      markRange(tr, tr.mapping.map(insertedFrom, 1), tr.mapping.map(insertedTo, -1), 'insert', username);
    }
  });
  return tr;
}

function promoteImageMarks(tr, username) {
  const drop = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return true;
    const mark = suggestionMarkOf(node);
    if (!mark) return false;
    const kind = mark.type.name === 'suggestion_insert' ? 'insert' : 'delete';
    if (kind === 'delete' && node.attrs.suggestion === 'insert') {
      drop.push(pos);
    } else {
      const marks = node.marks.filter((m) => m !== mark);
      const author = mark.attrs.username || username;
      tr.setNodeMarkup(pos, null, suggestionAttrs(node, kind, author), marks);
    }
    return false;
  });
  drop.reverse().forEach((pos) => tr.delete(pos, pos + 1));
}

function nodeDecorations(state) {
  const decos = [];
  state.doc.descendants((node, pos) => {
    const suggestion = nodeSuggestion(node);
    if (suggestion) {
      const attrs = { class: `da-suggestion-node da-suggestion-node-${suggestion}` };
      decos.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    }
    return true;
  });
  return DecorationSet.create(state.doc, decos);
}

export default function createSuggestionPlugin({ username }) {
  const base = suggestionModePlugin({ username });
  const { appendTransaction } = base.spec;

  return new Plugin({
    key: suggestionPluginKey,
    state: base.spec.state,

    props: {
      decorations: nodeDecorations,
      attributes: (state) => (isSuggesting(state) ? { class: 'da-suggesting' } : {}),
    },

    view() {
      let last = '';
      const publish = (view) => {
        const items = listSuggestions(view.state.doc);
        const key = JSON.stringify(items);
        if (key === last) return;
        last = key;
        canvasBus.suggestionsState.emit({ items });
      };
      return {
        update(view) { publish(view); },
        destroy() { canvasBus.suggestionsState.emit({ items: [] }); },
      };
    },
    // The plugin marks a deletion by putting the removed content back. Run that on a
    // peer's incoming change and it would undo their edit and re-attribute it to us,
    // then sync the undo to everyone — so skip any batch carrying a Yjs change.
    appendTransaction(transactions, oldState, newState) {
      if (transactions.some((tr) => tr.getMeta(ySyncPluginKey)?.isChangeOrigin)) return null;
      if (getSlashContext(newState)) return null;
      if (inPendingNode(newState.selection.$from)) return null;
      const live = liveTransactions(transactions, oldState);
      if (!live.length) return null;
      const author = suggestionPluginKey.getState(oldState)?.username ?? username;
      const blockChanges = collectBlockChanges(transactions, live);
      if (blockChanges) return trackBlockChanges(newState, blockChanges, author);
      const tr = appendTransaction.call(this, transactions, oldState, newState);
      if (tr) promoteImageMarks(tr, author);
      return tr;
    },
  });
}
