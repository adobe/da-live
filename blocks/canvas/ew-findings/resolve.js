// Pure helpers that locate evaluation-finding evidence in the ProseMirror document.

const QUOTE_MAP = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
};

const isSpace = (ch) => /\s/.test(ch);

/** NBSP/whitespace runs collapse to one space, typographic quotes become ASCII, then trim. */
export function normalizeText(text) {
  const src = String(text ?? '');
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    const ch = QUOTE_MAP[src[i]] ?? src[i];
    if (isSpace(ch)) {
      if (out && !out.endsWith(' ')) out += ' ';
    } else {
      out += ch;
    }
  }
  return out.trim();
}

/** Last path segment of a URL or path, without origin, query, hash or `./`. */
export function fileNameOf(src) {
  const clean = String(src ?? '').split(/[?#]/)[0];
  const name = clean.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

// Normalised text of one textblock plus, per normalised char, the PM position range it came from.
function flattenTextblock(node, blockPos) {
  const chars = [];
  const starts = [];
  const ends = [];
  const pushChar = (ch, from, to) => {
    if (isSpace(ch)) {
      if (!chars.length) return;
      if (chars[chars.length - 1] === ' ') {
        ends[ends.length - 1] = to;
        return;
      }
      chars.push(' ');
    } else {
      chars.push(ch);
    }
    starts.push(from);
    ends.push(to);
  };

  node.forEach((child, offset) => {
    const pos = blockPos + 1 + offset;
    if (child.isText) {
      for (let i = 0; i < child.text.length; i += 1) {
        const ch = child.text[i];
        pushChar(QUOTE_MAP[ch] ?? ch, pos + i, pos + i + 1);
      }
    } else {
      pushChar(' ', pos, pos + child.nodeSize);
    }
  });
  return { text: chars.join(''), starts, ends };
}

function findText(doc, quote) {
  const needle = normalizeText(quote);
  if (!needle) return null;
  let first = null;
  let count = 0;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const { text, starts, ends } = flattenTextblock(node, pos);
    let idx = text.indexOf(needle);
    while (idx !== -1) {
      count += 1;
      if (!first) {
        first = { from: starts[idx], to: ends[idx + needle.length - 1], blockPos: pos };
      }
      idx = text.indexOf(needle, idx + 1);
    }
    return false;
  });
  return first ? { ...first, ambiguous: count > 1 } : null;
}

function findImage(doc, src) {
  const name = fileNameOf(src);
  if (!name) return null;
  let first = null;
  let count = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === 'image' && fileNameOf(node.attrs?.src) === name) {
      count += 1;
      if (!first) first = { from: pos, to: pos + node.nodeSize, blockPos: pos };
    }
    return true;
  });
  return first ? { ...first, ambiguous: count > 1 } : null;
}

/**
 * @returns {{ from, to, anchorType, anchorText, ambiguous, blockPos } | null} PM range of the
 * first match. `blockPos` is the start of the containing textblock (text) or the image position.
 */
export function resolveEvidence(doc, evidence) {
  if (!doc || !evidence) return null;
  if (evidence.anchorType === 'text') {
    const hit = findText(doc, evidence.anchorText);
    if (!hit) return null;
    return {
      ...hit,
      anchorType: 'text',
      anchorText: doc.textBetween(hit.from, hit.to, ' '),
    };
  }
  if (evidence.anchorType === 'image') {
    const hit = findImage(doc, evidence.src);
    return hit ? { ...hit, anchorType: 'image', anchorText: '' } : null;
  }
  return null;
}

/** Human label for the element that holds the range, e.g. "Heading 1", "Paragraph", "Image". */
export function elementLabel(doc, range) {
  if (!doc || !range) return '';
  if (range.anchorType === 'image') return 'Image';
  const node = doc.nodeAt(range.blockPos);
  if (!node) return '';
  if (node.type.name === 'heading') return `Heading ${node.attrs?.level ?? 1}`;
  if (node.type.name === 'code_block') return 'Code block';
  const $pos = doc.resolve(Math.min(range.blockPos + 1, doc.content.size));
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'list_item') return 'List item';
  }
  return 'Paragraph';
}

function firstTextEvidence(finding) {
  return (finding.evidence ?? []).find((e) => e?.anchorType === 'text' && e.anchorText);
}

/**
 * Resolves each finding's first resolvable evidence.
 * @returns {Array<{ finding, range, groupKey, label, evidence }>} in input order. `groupKey` is
 * `text:<textblock start>` / `image:<node pos>`; findings that share it belong to one element.
 * `evidence` is the matched evidence, or (unresolved) the first text evidence for display.
 */
export function resolveFindings(doc, findings) {
  return (findings ?? []).map((finding) => {
    const list = finding.evidence ?? [];
    for (let i = 0; i < list.length; i += 1) {
      const range = resolveEvidence(doc, list[i]);
      if (range) {
        return {
          finding,
          range,
          evidence: list[i],
          groupKey: `${range.anchorType}:${range.blockPos}`,
          label: elementLabel(doc, range),
        };
      }
    }
    return {
      finding,
      range: null,
      evidence: firstTextEvidence(finding) ?? list[0] ?? null,
      groupKey: null,
      label: '',
    };
  });
}
