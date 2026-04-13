import {
  CellSelection,
  NodeSelection,
  TextSelection,
} from 'da-y-wrapper';
import { getRootComment } from './model.js';

function getDocTextWithPositions(doc) {
  let text = '';
  const positions = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const blockStart = pos + 1;
    node.forEach((child, childOffset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i += 1) {
          positions.push(blockStart + childOffset + i);
        }
        text += child.text;
      }
    });
    return false;
  });
  return { text, positions };
}

function suffixSimilarity(a, b) {
  let count = 0;
  for (let i = 1; i <= Math.min(a.length, b.length); i += 1) {
    if (a[a.length - i] === b[b.length - i]) count += 1;
    else break;
  }
  return count;
}

function prefixSimilarity(a, b) {
  let count = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] === b[i]) count += 1;
    else break;
  }
  return count;
}

export function resolveTextSelector(docText, docPositions, selector) {
  if (selector?.kind !== 'text' || !selector.exact) return null;

  const prefixLen = (selector.prefix ?? '').length;
  const suffixLen = (selector.suffix ?? '').length;
  const contextLen = prefixLen + suffixLen;

  let bestMatch = null;
  let bestScore = -1;
  let totalMatches = 0;

  let index = docText.indexOf(selector.exact);
  while (index !== -1) {
    totalMatches += 1;
    const end = index + selector.exact.length;
    const actualPrefix = docText.slice(Math.max(0, index - prefixLen), index);
    const actualSuffix = docText.slice(end, end + suffixLen);
    const score = suffixSimilarity(actualPrefix, selector.prefix ?? '')
      + prefixSimilarity(actualSuffix, selector.suffix ?? '');
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { from: docPositions[index], to: docPositions[end - 1] + 1 };
    }
    index = docText.indexOf(selector.exact, index + 1);
  }

  if (totalMatches === 0) return null;
  if (totalMatches === 1 && contextLen === 0) return bestMatch;

  const minScore = Math.max(3, Math.ceil(contextLen * 0.3));
  if (contextLen > 0 && bestScore < minScore) return null;

  return bestMatch;
}

function getBlockContext(doc, from, to) {
  const $from = doc.resolve(Math.min(from + 1, doc.content.size));
  const $to = doc.resolve(Math.max(to - 1, 0));
  const blockStart = $from.start($from.depth);
  const blockEnd = $to.end($to.depth);

  const inBlockPrefix = doc.textBetween(blockStart, from, '', '');
  const inBlockSuffix = doc.textBetween(to, blockEnd, '', '');

  if (!inBlockPrefix && !inBlockSuffix) {
    const blockNodePos = $from.before($from.depth);
    const blockNode = doc.nodeAt(blockNodePos);
    const nextBlockStart = blockNodePos + (blockNode?.nodeSize ?? 0);
    return {
      prefix: doc.textBetween(Math.max(0, blockNodePos - 100), blockNodePos, '', ''),
      suffix: doc.textBetween(nextBlockStart, Math.min(doc.content.size, nextBlockStart + 100), '', ''),
    };
  }

  return { prefix: inBlockPrefix, suffix: inBlockSuffix };
}

export function buildTextSelector(state, from, to, selectedText) {
  if (!selectedText?.trim()) return null;
  const { prefix, suffix } = getBlockContext(state.doc, from, to);
  return { kind: 'text', exact: selectedText, prefix, suffix };
}

function getSelectionBounds(selection) {
  if (!(selection instanceof CellSelection)) {
    return { from: selection.from, to: selection.to };
  }

  if (!Array.isArray(selection.ranges) || selection.ranges.length === 0) {
    return {
      from: selection.from ?? 0,
      to: selection.to ?? selection.from ?? 0,
    };
  }

  const from = Math.min(...selection.ranges.map((range) => range.$from.pos));
  const to = Math.max(...selection.ranges.map((range) => range.$to.pos));
  return { from, to };
}

function getBlockTextWithPositions(parent, blockStart) {
  let text = '';
  const positions = [];
  parent.forEach((child, childOffset) => {
    if (child.isText && child.text) {
      for (let i = 0; i < child.text.length; i += 1) {
        positions.push(blockStart + childOffset + i);
      }
      text += child.text;
    }
  });
  return { text, positions };
}

const isWordChar = (ch) => /[\p{L}\p{N}_]/u.test(ch);

export function expandToWord(doc, pos) {
  const $pos = doc.resolve(pos);
  const { parent } = $pos;
  if (!parent.isTextblock) return null;

  const blockStart = $pos.start($pos.depth);
  const { text, positions } = getBlockTextWithPositions(parent, blockStart);
  if (!text.length) return null;

  let idx = positions.length;
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i] >= pos) { idx = i; break; }
  }

  const wordAt = (i) => i >= 0 && i < text.length && isWordChar(text[i]);

  let start;
  let end;

  if (wordAt(idx) || wordAt(idx - 1)) {
    const seed = wordAt(idx) ? idx : idx - 1;
    start = seed;
    end = seed + 1;
    while (start > 0 && wordAt(start - 1)) start -= 1;
    while (end < text.length && wordAt(end)) end += 1;
  } else {
    let before = idx - 1;
    let after = idx;
    while (before >= 0 && !wordAt(before)) before -= 1;
    while (after < text.length && !wordAt(after)) after += 1;

    const distBefore = before >= 0 ? (idx - before - 1) : Infinity;
    const distAfter = after < text.length ? (after - idx) : Infinity;
    if (distBefore === Infinity && distAfter === Infinity) return null;

    if (distBefore <= distAfter) {
      end = before + 1;
      start = before;
      while (start > 0 && wordAt(start - 1)) start -= 1;
    } else {
      start = after;
      end = after + 1;
      while (end < text.length && wordAt(end)) end += 1;
    }
  }

  return { from: positions[start], to: positions[end - 1] + 1 };
}

export function canExpandForComment(state) {
  if (!state?.selection) return false;
  const { selection } = state;
  if (selection instanceof NodeSelection || selection instanceof CellSelection) return false;
  if (selection.from !== selection.to) return false;

  const $pos = state.doc.resolve(selection.from);
  return $pos.parent.isTextblock && $pos.parent.textContent.trim().length > 0;
}

export function getSelectionData(state) {
  if (!state?.selection) return null;

  const { selection } = state;
  const { from, to } = getSelectionBounds(selection);

  const isImage = selection instanceof NodeSelection
    && selection.node?.type.name === 'image';
  if (isImage) {
    const { node } = selection;
    const { prefix, suffix } = getBlockContext(state.doc, from, to);
    return {
      from,
      to,
      selectedText: 'an image',
      isImage: true,
      imageRef: node?.attrs?.src || null,
      selector: { kind: 'image', prefix, suffix },
    };
  }

  const isTable = selection instanceof CellSelection
    || (selection instanceof NodeSelection && selection.node?.type.name === 'table');

  const selectedText = state.doc.textBetween(from, to, '', '');

  if (from === to && !isTable) return null;
  if (!selectedText.trim()) return null;

  return {
    from,
    to,
    selectedText,
    isImage: false,
    imageRef: null,
    selector: buildTextSelector(state, from, to, selectedText),
  };
}

export function expandAndGetSelectionData(view) {
  const { state } = view;
  const { selection } = state;

  if (selection.from !== selection.to
    || selection instanceof NodeSelection
    || selection instanceof CellSelection) {
    return getSelectionData(state);
  }

  const expanded = expandToWord(state.doc, selection.from);
  if (!expanded) return null;

  const tr = state.tr.setSelection(
    TextSelection.create(state.doc, expanded.from, expanded.to),
  );
  view.dispatch(tr);
  return getSelectionData(view.state);
}

export function hasCommentableSelection(state) {
  if (!state?.selection) return false;

  const { selection } = state;
  const { from, to } = getSelectionBounds(selection);

  const isImage = selection instanceof NodeSelection
    && selection.node?.type.name === 'image';
  if (isImage) return true;

  return Boolean(state.doc.textBetween(from, to, '', '').trim());
}

export function resolveAnchor({ state, comment, docText, docPositions }) {
  if (comment.isImage && comment.imageRef) {
    const matches = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs?.src === comment.imageRef) {
        matches.push({ from: pos, to: pos + node.nodeSize });
      }
      return true;
    });
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    const { prefix = '', suffix = '' } = comment.selector ?? {};
    let bestMatch = matches[0];
    let bestScore = -1;
    for (const match of matches) {
      const { from: mFrom, to: mTo } = match;
      const { prefix: actualPrefix, suffix: actualSuffix } = getBlockContext(state.doc, mFrom, mTo);
      const score = suffixSimilarity(actualPrefix, prefix) + prefixSimilarity(actualSuffix, suffix);
      if (score > bestScore) { bestScore = score; bestMatch = match; }
    }
    return bestMatch;
  }

  if (comment.selector?.kind === 'text') {
    let text = docText;
    let pos = docPositions;
    if (text == null || pos == null) {
      ({ text, positions: pos } = getDocTextWithPositions(state.doc));
    }
    return resolveTextSelector(text, pos, comment.selector);
  }

  return null;
}

export function resolveAllAnchors({ state, threads }) {
  const { text: docText, positions: docPositions } = getDocTextWithPositions(state.doc);
  const resolved = new Map();
  threads.forEach((thread, threadId) => {
    const root = getRootComment(thread);
    if (!root || root.resolved) return;

    const range = resolveAnchor({ state, comment: root, docText, docPositions });
    if (range) {
      resolved.set(threadId, range);
    }
  });
  return resolved;
}

export function findThreadAtPosition({ cache, pos }) {
  let threadId = null;
  let bestSize = Infinity;

  cache.forEach((range, id) => {
    if (range.from < range.to && pos >= range.from && pos < range.to) {
      const size = range.to - range.from;
      if (size < bestSize) {
        bestSize = size;
        threadId = id;
      }
    }
  });

  return threadId;
}
