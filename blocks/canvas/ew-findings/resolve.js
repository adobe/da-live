// Pure helpers that locate evaluation-finding evidence in the ProseMirror document.

const QUOTE_MAP = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2013': '-',
  '\u2014': '-',
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

/**
 * Text evidence `occurrence` (1-based) is the position of the quote among ALL its occurrences in
 * the textblocks of the document, in document order. This is the definition the Brand Governance
 * Agent uses (`page_findings._TextPool.occurrence`): matching is case-insensitive on normalised
 * text (typographic quotes, dashes, whitespace runs); occurrences in one block do not overlap.
 * E.g. for `Test content update`, `Test` the paragraph `Test` is occurrence 2 of "Test".
 * Without a usable occurrence the match is case-sensitive: a block whose whole text is the quote
 * wins over a substring match, then the first match.
 */
function findText(doc, quote, occurrence) {
  const needle = normalizeText(quote);
  if (!needle) return null;
  const lowerNeedle = needle.toLowerCase();
  const matches = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const { text, starts, ends } = flattenTextblock(node, pos);
    const lower = text.toLowerCase();
    // Lowercasing must keep offsets aligned with the position maps.
    const haystack = lower.length === text.length ? lower : text;
    const needleForBlock = haystack === lower ? lowerNeedle : needle;
    let idx = haystack.indexOf(needleForBlock);
    while (idx !== -1) {
      matches.push({
        from: starts[idx],
        to: ends[idx + needleForBlock.length - 1],
        blockPos: pos,
        exact: text.startsWith(needle, idx),
        whole: text === needle,
      });
      idx = haystack.indexOf(needleForBlock, idx + needleForBlock.length);
    }
    return false;
  });

  let hit;
  let count;
  if (Number.isInteger(occurrence) && occurrence >= 1 && occurrence <= matches.length) {
    hit = matches[occurrence - 1];
    count = matches.length;
  } else {
    const exact = matches.filter((m) => m.exact);
    hit = exact.find((m) => m.whole) ?? exact[0];
    count = exact.length;
  }
  if (!hit) return null;
  return {
    from: hit.from,
    to: hit.to,
    blockPos: hit.blockPos,
    ambiguous: count > 1,
  };
}

/**
 * Image evidence `occurrence` (1-based) is the position of the image among the images of the
 * document with the same file name (see `fileNameOf`), in document order; the Brand Governance
 * Agent counts the same way (`page_findings.file_name_of`). Missing or out of range: first match.
 */
function findImage(doc, src, occurrence) {
  const name = fileNameOf(src);
  if (!name) return null;
  const matches = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'image' && fileNameOf(node.attrs?.src) === name) {
      matches.push({ from: pos, to: pos + node.nodeSize, blockPos: pos });
    }
    return true;
  });
  if (!matches.length) return null;
  const wanted = Number.isInteger(occurrence) && occurrence >= 1 && occurrence <= matches.length
    ? occurrence - 1
    : 0;
  return { ...matches[wanted], ambiguous: matches.length > 1 };
}

/**
 * @returns {{ from, to, anchorType, anchorText, ambiguous, blockPos } | null} PM range of the
 * match chosen by `evidence.occurrence`, else the best one. `blockPos` is the start of the
 * containing textblock (text) or the image position.
 */
export function resolveEvidence(doc, evidence) {
  if (!doc || !evidence) return null;
  if (evidence.anchorType === 'text') {
    const hit = findText(doc, evidence.anchorText, evidence.occurrence);
    if (!hit) return null;
    return {
      ...hit,
      anchorType: 'text',
      anchorText: doc.textBetween(hit.from, hit.to, ' '),
    };
  }
  if (evidence.anchorType === 'image') {
    const hit = findImage(doc, evidence.src, evidence.occurrence);
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
