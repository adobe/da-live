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

const MARK_LABELS = {
  strong: 'bold',
  em: 'italic',
  u: 'underline',
  s: 'strikethrough',
  code: 'code',
  sub: 'subscript',
  sup: 'superscript',
};

const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// Inline runs of a textblock: consecutive text children with the same mark set merge into one.
function inlineRuns(node) {
  const runs = [];
  node.forEach((child) => {
    if (!child.isText) {
      runs.push({ text: ' ', marks: [] });
      return;
    }
    runs.push({ text: child.text, marks: child.marks });
  });
  return runs;
}

// One entry per maximal stretch of text that carries the mark (by `keyOf`), in document order.
function spansOf(runs, keyOf) {
  const spans = [];
  let open;
  runs.forEach((run) => {
    const key = keyOf(run.marks);
    if (key === undefined) {
      open = undefined;
      return;
    }
    if (open && open.key === key) {
      open.text += run.text;
    } else {
      open = { key, text: run.text };
      spans.push(open);
    }
  });
  return spans;
}

function linksOf(runs) {
  const hrefOf = (marks) => marks.find((m) => m.type.name === 'link')?.attrs.href;
  return spansOf(runs, hrefOf)
    .map(({ key, text }) => ({ text: squash(text), href: key }))
    .filter((link) => link.text || link.href);
}

function formattingOf(runs, fullText) {
  const found = [];
  Object.entries(MARK_LABELS).forEach(([name, mark]) => {
    spansOf(runs, (marks) => (marks.some((m) => m.type.name === name) ? name : undefined))
      .forEach(({ text }) => {
        const part = squash(text);
        if (part) found.push({ mark, text: part, whole: part === fullText });
      });
  });
  return found;
}

// A paragraph that is one link (optionally bold/italic) is a button in an Edge Delivery page.
function isButton(links, fullText) {
  return links.length === 1 && squash(links[0].text) === fullText && fullText !== '';
}

function inListItem(doc, blockPos) {
  const $pos = doc.resolve(Math.min(blockPos + 1, doc.content.size));
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'list_item') return d;
  }
  return 0;
}

function kindOf(doc, node, blockPos, links, fullText) {
  if (node.type.name === 'image') return 'Image';
  if (node.type.name === 'heading') return `Heading ${node.attrs?.level ?? 1}`;
  if (node.type.name === 'code_block') return 'Code block';
  if (inListItem(doc, blockPos)) return 'List item';
  return isButton(links, fullText) ? 'Button' : 'Paragraph';
}

function describeNode(doc, node, pos) {
  if (!node) return '';
  if (node.type.name === 'image') return 'Image';
  if (!node.isTextblock && !['list_item', 'bullet_list', 'ordered_list'].includes(node.type.name)) {
    return '';
  }
  const target = node.isTextblock ? node : node.firstChild;
  if (!target?.isTextblock) return '';
  const runs = inlineRuns(target);
  const text = squash(runs.map((r) => r.text).join(''));
  if (!text) return '';
  const links = linksOf(runs);
  const kind = kindOf(doc, target, pos, links, text);
  const href = kind === 'Button' ? ` → ${links[0].href}` : '';
  return `${kind} "${clip(text, 60)}"${href}`;
}

// The previous and next sibling of the element (the list item when it is in a list).
function neighboursOf(doc, blockPos) {
  const depth = inListItem(doc, blockPos);
  const $pos = doc.resolve(blockPos);
  const level = depth ? depth - 1 : $pos.depth;
  const parent = $pos.node(level);
  const index = depth ? $pos.index(level) : $pos.index();
  const at = (i) => {
    const child = i >= 0 && i < parent.childCount ? parent.child(i) : null;
    if (!child) return '';
    let offset = 0;
    for (let k = 0; k < i; k += 1) offset += parent.child(k).nodeSize;
    return describeNode(doc, child, $pos.start(level) + offset);
  };
  return { prev: at(index - 1), next: at(index + 1) };
}

/**
 * Everything the element suggestion request needs to say about the element a range sits in.
 * Text is the full text of the textblock (whitespace collapsed, typography untouched).
 * @returns {{ anchorType, kindLabel, text, words, links, formatting, neighbours, listSize?,
 *   src?, fileName?, alt? } | null}
 */
export function elementSnapshot(doc, range) {
  if (!doc || !range) return null;
  const node = doc.nodeAt(range.blockPos);
  if (!node) return null;
  const neighbours = neighboursOf(doc, range.blockPos);
  if (range.anchorType === 'image' || node.type.name === 'image') {
    const src = node.attrs?.src ?? '';
    return {
      anchorType: 'image',
      kindLabel: 'Image',
      text: '',
      words: 0,
      src,
      fileName: fileNameOf(src),
      alt: node.attrs?.alt ?? '',
      links: node.attrs?.href ? [{ text: 'image', href: node.attrs.href }] : [],
      formatting: [],
      neighbours,
    };
  }
  if (!node.isTextblock) return null;
  const runs = inlineRuns(node);
  const text = squash(runs.map((r) => r.text).join(''));
  const links = linksOf(runs);
  const depth = inListItem(doc, range.blockPos);
  return {
    anchorType: 'text',
    kindLabel: kindOf(doc, node, range.blockPos, links, text),
    text,
    words: text ? text.split(' ').length : 0,
    links,
    formatting: formattingOf(runs, text),
    neighbours,
    ...(depth && { listSize: doc.resolve(range.blockPos).node(depth - 1).childCount }),
  };
}

/**
 * Resolves the findings of one failing element to its place in the document.
 * @returns {{ range, evidence, groupKey, findings, snapshot } | null} `findings` are the ones that
 * belong to that element: they resolve to it, or they did not resolve and are of its kind.
 */
export function resolveGroup(doc, findings) {
  const results = resolveFindings(doc, findings);
  const first = results.find((r) => r.range);
  if (!first) return null;
  const snapshot = elementSnapshot(doc, first.range);
  if (!snapshot) return null;
  const kind = first.range.anchorType;
  const mine = results.filter((r) => (r.range
    ? r.groupKey === first.groupKey
    : (r.finding.assetType ?? 'text') === kind));
  return {
    range: first.range,
    evidence: first.evidence,
    groupKey: first.groupKey,
    findings: mine.map((r) => r.finding),
    snapshot,
  };
}
