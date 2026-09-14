/* eslint-disable no-cond-assign, no-case-declarations */
/**
 * HTML-aware diff that produces low-noise, structure-preserving change markup.
 *
 * Pipeline:
 *   1. Block-level pre-segmentation. Top-level block elements are paired so a change in
 *      one paragraph cannot misalign neighbouring paragraphs. Unpaired blocks are wrapped
 *      whole; paired-but-modified blocks fall through to inline diff.
 *   2. Word/tag tokenization with normalised tag signatures (attribute-set equality, not
 *      string equality) and whitespace-tolerant equality (any run of whitespace == any
 *      other), so trivial reformatting does not produce diffs.
 *   3. Ratcliff–Obershelp matching-blocks LCS (the algorithm behind Python's
 *      difflib.SequenceMatcher), then a semantic-cleanup pass that coalesces edit
 *      clusters separated only by short or whitespace-only equal runs.
 *   4. Tag-balanced rendering: <ins>/<del> wrappers never enclose an unbalanced open or
 *      close tag, and a tag-pair added/removed around equal content is rendered as a
 *      single wrapper around the whole element rather than two separate markers.
 */

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

const TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9-]*[^>]*>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_.:]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>=`]+)/g;

function normalizeAttrs(attrString) {
  if (!attrString) return '';
  const attrs = [];
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(attrString)) !== null) {
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"'))
        || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    attrs.push(`${m[1].toLowerCase()}=${val.replace(/\s+/g, ' ').trim()}`);
  }
  attrs.sort();
  return attrs.join('|');
}

function describeTag(raw) {
  const m = raw.match(/^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)\s*\/?\s*>$/);
  if (!m) return { kind: 'void', name: '', signature: `raw:${raw}`, content: raw };
  const isClose = !!m[1];
  const name = m[2].toLowerCase();
  const attrString = m[3] || '';
  const selfClosing = /\/\s*>$/.test(raw);
  let kind;
  if (isClose) kind = 'close';
  else if (selfClosing || VOID_ELEMENTS.has(name)) kind = 'void';
  else kind = 'open';
  const signature = `${kind}:${name}:${normalizeAttrs(attrString)}`;
  return { kind, name, signature, content: raw };
}

function pushTextTokens(tokens, text) {
  if (!text) return;
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) {
      // empty splits at the boundaries
    } else if (/^\s+$/.test(part)) {
      tokens.push({ kind: 'space', content: part, signature: 'space' });
    } else {
      tokens.push({ kind: 'word', content: part, signature: `w:${part}` });
    }
  }
}

function tokenize(html) {
  const tokens = [];
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html)) !== null) {
    if (m.index > last) pushTextTokens(tokens, html.substring(last, m.index));
    const tag = describeTag(m[0]);
    tokens.push({ ...tag });
    last = m.index + m[0].length;
  }
  if (last < html.length) pushTextTokens(tokens, html.substring(last));
  return tokens;
}

// ---------------------------------------------------------------------------
// Ratcliff–Obershelp matching-blocks LCS
// ---------------------------------------------------------------------------

function buildIndex(tokens) {
  const map = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    const sig = tokens[i].signature;
    let bucket = map.get(sig);
    if (!bucket) {
      bucket = [];
      map.set(sig, bucket);
    }
    bucket.push(i);
  }
  return map;
}

function findLongestMatch(a, b, alo, ahi, blo, bhi, b2j) {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map();
  for (let i = alo; i < ahi; i += 1) {
    const newJ2len = new Map();
    const indices = b2j.get(a[i].signature);
    if (indices) {
      for (const j of indices) {
        if (j >= bhi) break;
        if (j >= blo) {
          const k = (j2len.get(j - 1) || 0) + 1;
          newJ2len.set(j, k);
          if (k > bestsize) {
            besti = i - k + 1;
            bestj = j - k + 1;
            bestsize = k;
          }
        }
      }
    }
    j2len = newJ2len;
  }
  return { besti, bestj, bestsize };
}

function getMatchingBlocks(a, b) {
  const b2j = buildIndex(b);
  const blocks = [];
  const stack = [[0, a.length, 0, b.length]];
  while (stack.length) {
    const [alo, ahi, blo, bhi] = stack.pop();
    const { besti, bestj, bestsize } = findLongestMatch(a, b, alo, ahi, blo, bhi, b2j);
    if (bestsize > 0) {
      blocks.push({ ai: besti, bi: bestj, size: bestsize });
      if (alo < besti && blo < bestj) stack.push([alo, besti, blo, bestj]);
      if (besti + bestsize < ahi && bestj + bestsize < bhi) {
        stack.push([besti + bestsize, ahi, bestj + bestsize, bhi]);
      }
    }
  }
  blocks.sort((x, y) => x.ai - y.ai || x.bi - y.bi);
  const merged = [];
  for (const blk of blocks) {
    const last = merged.length ? merged[merged.length - 1] : null;
    if (last && last.ai + last.size === blk.ai && last.bi + last.size === blk.bi) {
      last.size += blk.size;
    } else {
      merged.push({ ...blk });
    }
  }
  merged.push({ ai: a.length, bi: b.length, size: 0 });
  return merged;
}

function computeOps(a, b) {
  const blocks = getMatchingBlocks(a, b);
  const ops = [];
  let ai = 0;
  let bi = 0;
  for (const blk of blocks) {
    const oldLen = blk.ai - ai;
    const newLen = blk.bi - bi;
    if (oldLen > 0 && newLen > 0) {
      ops.push({ type: 'delete', oldStart: ai, oldEnd: blk.ai });
      ops.push({ type: 'insert', newStart: bi, newEnd: blk.bi });
    } else if (oldLen > 0) {
      ops.push({ type: 'delete', oldStart: ai, oldEnd: blk.ai });
    } else if (newLen > 0) {
      ops.push({ type: 'insert', newStart: bi, newEnd: blk.bi });
    }
    if (blk.size > 0) {
      ops.push({
        type: 'equal',
        oldStart: blk.ai,
        oldEnd: blk.ai + blk.size,
        newStart: blk.bi,
        newEnd: blk.bi + blk.size,
      });
    }
    ai = blk.ai + blk.size;
    bi = blk.bi + blk.size;
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Semantic cleanup: coalesce edit clusters separated by trivial equal runs
// ---------------------------------------------------------------------------

function isSubstantialEqual(op, oldTokens) {
  if (op.type !== 'equal') return false;
  // Any non-whitespace token anchors. Whitespace-only equal runs get merged into
  // surrounding edits, so trivial spacing between phrases doesn't fragment the output.
  for (let i = op.oldStart; i < op.oldEnd; i += 1) {
    if (oldTokens[i].kind !== 'space') return true;
  }
  return false;
}

function cleanupSemantic(ops, oldTokens) {
  const out = [];
  let cluster = [];

  const flushCluster = () => {
    if (cluster.length === 0) return;
    // Pull whitespace-only equals at the cluster boundaries back out as their own ops,
    // so a space adjacent to an edit doesn't get swallowed into the <ins>/<del> wrapper.
    while (cluster.length > 0 && cluster[0].type === 'equal') {
      out.push(cluster.shift());
    }
    const trailing = [];
    while (cluster.length > 0 && cluster[cluster.length - 1].type === 'equal') {
      trailing.unshift(cluster.pop());
    }
    if (cluster.length > 0) {
      let oldStart = Infinity;
      let oldEnd = -Infinity;
      let newStart = Infinity;
      let newEnd = -Infinity;
      for (const op of cluster) {
        if (op.type === 'equal' || op.type === 'delete') {
          oldStart = Math.min(oldStart, op.oldStart);
          oldEnd = Math.max(oldEnd, op.oldEnd);
        }
        if (op.type === 'equal' || op.type === 'insert') {
          newStart = Math.min(newStart, op.newStart);
          newEnd = Math.max(newEnd, op.newEnd);
        }
      }
      const hasOld = Number.isFinite(oldStart) && oldEnd > oldStart;
      const hasNew = Number.isFinite(newStart) && newEnd > newStart;
      if (hasOld) out.push({ type: 'delete', oldStart, oldEnd });
      if (hasNew) out.push({ type: 'insert', newStart, newEnd });
    }
    for (const t of trailing) out.push(t);
    cluster = [];
  };

  for (const op of ops) {
    if (op.type === 'equal' && isSubstantialEqual(op, oldTokens)) {
      flushCluster();
      out.push(op);
    } else {
      cluster.push(op);
    }
  }
  flushCluster();
  return out;
}

// ---------------------------------------------------------------------------
// Tag-balanced rendering with wrap-around detection
// ---------------------------------------------------------------------------

function findUnbalanced(tokens) {
  const unbalanced = new Set();
  const stack = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.kind === 'open') {
      stack.push(i);
    } else if (t.kind === 'close') {
      let matched = -1;
      for (let s = stack.length - 1; s >= 0; s -= 1) {
        if (tokens[stack[s]].name === t.name) {
          matched = s;
          break;
        }
      }
      if (matched === -1) {
        unbalanced.add(i);
      } else {
        stack.length = matched;
      }
    }
  }
  for (const idx of stack) unbalanced.add(idx);
  return unbalanced;
}

function wrap(html, klass) {
  if (!html) return '';
  const tag = klass === 'diffins' ? 'ins' : 'del';
  return `<${tag} class="${klass}">${html}</${tag}>`;
}

function renderEditTokens(tokens, klass) {
  if (tokens.length === 0) return '';
  const unbalanced = findUnbalanced(tokens);
  let out = '';
  let buffer = '';
  for (let i = 0; i < tokens.length; i += 1) {
    if (unbalanced.has(i)) {
      out += wrap(buffer, klass);
      out += wrap(tokens[i].content, klass);
      buffer = '';
    } else {
      buffer += tokens[i].content;
    }
  }
  out += wrap(buffer, klass);
  return out;
}

function tokensToString(tokens) {
  let s = '';
  for (const t of tokens) s += t.content;
  return s;
}

/**
 * Detect a "wrap-around" change: an edit run starts with one or more unbalanced opens
 * and the next edit run of the same type (after one equal run) starts with the matching
 * unbalanced closes. Render those unbalanced tags with their equal-content sandwiched,
 * marked with diffmod styling, instead of emitting the open and close as two separate
 * <ins>/<del> blocks. This is what makes "<strong> wrapped around 'world'" read as one
 * change rather than two stranded tag insertions.
 */
function tryWrapAround(opIndex, ops, oldTokens, newTokens) {
  const op = ops[opIndex];
  if (op.type !== 'insert' && op.type !== 'delete') return null;
  const next = ops[opIndex + 1];
  const after = ops[opIndex + 2];
  if (!next || next.type !== 'equal') return null;
  if (!after || after.type !== op.type) return null;

  const editTokens = op.type === 'insert'
    ? newTokens.slice(op.newStart, op.newEnd)
    : oldTokens.slice(op.oldStart, op.oldEnd);
  const closeTokens = op.type === 'insert'
    ? newTokens.slice(after.newStart, after.newEnd)
    : oldTokens.slice(after.oldStart, after.oldEnd);

  // Collect leading opens on the first edit and matching trailing closes on the second.
  const leadingOpens = [];
  for (const t of editTokens) {
    if (t.kind === 'open') leadingOpens.push(t);
    else break;
  }
  if (leadingOpens.length === 0) return null;

  let matched = 0;
  const trailingCloses = [];
  for (let i = 0; i < closeTokens.length; i += 1) {
    const t = closeTokens[i];
    if (t.kind === 'close' && matched < leadingOpens.length
        && t.name === leadingOpens[leadingOpens.length - 1 - matched].name) {
      trailingCloses.push(t);
      matched += 1;
    } else {
      break;
    }
  }
  if (matched === 0) return null;

  const usedOpens = leadingOpens.slice(0, matched);
  const usedCloses = trailingCloses.slice(0, matched);

  // The remaining tokens on either side fall back through normal rendering.
  const editRest = editTokens.slice(usedOpens.length);
  const closeRest = closeTokens.slice(usedCloses.length);

  const klass = op.type === 'insert' ? 'diffins' : 'diffdel';
  let html = '';
  if (editRest.length) html += renderEditTokens(editRest, klass);

  // Wrap the equal content with the inserted/deleted tags, inside a single <ins>/<del>.
  let inner = '';
  for (const t of usedOpens) inner += t.content;
  inner += tokensToString(
    oldTokens.slice(next.oldStart, next.oldEnd),
  );
  for (const t of usedCloses) inner += t.content;
  html += wrap(inner, klass);

  if (closeRest.length) html += renderEditTokens(closeRest, klass);

  return { html, consumed: 3 };
}

function renderOps(ops, oldTokens, newTokens) {
  let out = '';
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.type === 'equal') {
      // Use new-side tokens so whitespace/attribute normalization reflects the new state.
      out += tokensToString(newTokens.slice(op.newStart, op.newEnd));
      i += 1;
    } else {
      const wrapped = tryWrapAround(i, ops, oldTokens, newTokens);
      if (wrapped) {
        out += wrapped.html;
        i += wrapped.consumed;
      } else {
        if (op.type === 'insert') {
          out += renderEditTokens(newTokens.slice(op.newStart, op.newEnd), 'diffins');
        } else {
          out += renderEditTokens(oldTokens.slice(op.oldStart, op.oldEnd), 'diffdel');
        }
        i += 1;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline diff (Phases 1+2 combined): tokenize → LCS → cleanup → render
// ---------------------------------------------------------------------------

function inlineDiff(oldHtml, newHtml) {
  if (oldHtml === newHtml) return oldHtml;
  const oldTokens = tokenize(oldHtml);
  const newTokens = tokenize(newHtml);
  const rawOps = computeOps(oldTokens, newTokens);
  const ops = cleanupSemantic(rawOps, oldTokens);
  return renderOps(ops, oldTokens, newTokens);
}

// ---------------------------------------------------------------------------
// Phase 3: block-level segmentation
// ---------------------------------------------------------------------------

/**
 * Split HTML into top-level "block units" using a depth-tracking tokenizer pass.
 * Each unit is either a closed block element, a void element, or a run of inline content.
 * Returns null if the depth never returns to zero (malformed HTML), so the caller can
 * fall back to plain inline diff.
 */
function segmentTopLevelBlocks(html) {
  const units = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)\/?>/g;
  let depth = 0;
  let blockStart = -1;
  let inlineStart = 0;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const name = m[1].toLowerCase();
    const isClose = m[0].startsWith('</');
    const isSelfClose = /\/\s*>$/.test(m[0]);
    const isVoid = VOID_ELEMENTS.has(name) || isSelfClose;

    if (depth === 0) {
      if (isClose) {
        // Stray close at top level — treat as malformed.
        return null;
      }
      // Flush any inline content that preceded this top-level open/void.
      if (m.index > inlineStart) {
        const inline = html.substring(inlineStart, m.index);
        if (inline.trim()) units.push({ kind: 'inline', html: inline, text: inline, name: 'inline' });
      }
      if (isVoid) {
        units.push({ kind: 'void', html: m[0], text: '', name });
        inlineStart = m.index + m[0].length;
      } else {
        depth = 1;
        blockStart = m.index;
      }
    } else if (isClose) {
      depth -= 1;
      if (depth === 0) {
        const blockHtml = html.substring(blockStart, m.index + m[0].length);
        const text = blockHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const topName = (blockHtml.match(/^<\s*([a-zA-Z][a-zA-Z0-9-]*)/) || [])[1] || '';
        units.push({ kind: 'block', html: blockHtml, text, name: topName.toLowerCase() });
        inlineStart = m.index + m[0].length;
      }
    } else if (!isVoid) {
      depth += 1;
    }
  }
  if (depth !== 0) return null;
  if (inlineStart < html.length) {
    const inline = html.substring(inlineStart);
    if (inline.trim()) units.push({ kind: 'inline', html: inline, text: inline, name: 'inline' });
  }
  return units;
}

function similarityScore(a, b) {
  const sameKind = a.kind === b.kind;
  const sameName = a.name === b.name;
  const wordsA = new Set(a.text.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.text.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return sameKind && sameName ? 1 : 0;
  let inter = 0;
  for (const w of wordsA) if (wordsB.has(w)) inter += 1;
  const union = wordsA.size + wordsB.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  // Same kind + same tag name is a strong pairing signal even without word overlap —
  // e.g. "<strong>world</strong>" and "<strong>universe</strong>" should still pair so
  // we can inline-diff them rather than emit two whole-block del/ins markers.
  let score = jaccard;
  if (sameKind && sameName) score += 0.5;
  else if (sameKind) score += 0.1;
  return Math.min(1, score);
}

function pairAndDiffUnits(oldUnits, newUnits) {
  if (oldUnits.length === 0 && newUnits.length === 0) return '';
  if (oldUnits.length === 0) {
    return newUnits.map((u) => wrap(u.html, 'diffins')).join('');
  }
  if (newUnits.length === 0) {
    return oldUnits.map((u) => wrap(u.html, 'diffdel')).join('');
  }

  // Greedy similarity pairing, but only forward-monotonic pairs (preserves order).
  const pairs = [];
  const candidates = [];
  for (let i = 0; i < oldUnits.length; i += 1) {
    for (let j = 0; j < newUnits.length; j += 1) {
      const score = similarityScore(oldUnits[i], newUnits[j]);
      if (score >= 0.34) candidates.push({ i, j, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedOld = new Set();
  const usedNew = new Set();
  for (const c of candidates) {
    if (!usedOld.has(c.i) && !usedNew.has(c.j)) {
      // Reject if it would cross an existing pair (preserve relative order).
      let crosses = false;
      for (const p of pairs) {
        if ((p.i < c.i && p.j > c.j) || (p.i > c.i && p.j < c.j)) {
          crosses = true;
          break;
        }
      }
      if (!crosses) {
        pairs.push({ i: c.i, j: c.j });
        usedOld.add(c.i);
        usedNew.add(c.j);
      }
    }
  }
  pairs.sort((a, b) => a.i - b.i);

  let oi = 0;
  let ni = 0;
  let out = '';
  for (const p of pairs) {
    while (oi < p.i) {
      out += wrap(oldUnits[oi].html, 'diffdel');
      oi += 1;
    }
    while (ni < p.j) {
      out += wrap(newUnits[ni].html, 'diffins');
      ni += 1;
    }
    out += inlineDiff(oldUnits[p.i].html, newUnits[p.j].html);
    oi += 1;
    ni += 1;
  }
  while (oi < oldUnits.length) {
    out += wrap(oldUnits[oi].html, 'diffdel');
    oi += 1;
  }
  while (ni < newUnits.length) {
    out += wrap(newUnits[ni].html, 'diffins');
    ni += 1;
  }
  return out;
}

function diffByBlocks(oldHtml, newHtml) {
  const oldUnits = segmentTopLevelBlocks(oldHtml);
  const newUnits = segmentTopLevelBlocks(newHtml);
  if (!oldUnits || !newUnits) return null;

  // Don't bother with block-level work if neither side actually has multiple blocks
  // and there is no full-block insert or delete to detect.
  const oldBlockCount = oldUnits.filter((u) => u.kind === 'block').length;
  const newBlockCount = newUnits.filter((u) => u.kind === 'block').length;
  if (oldBlockCount <= 1 && newBlockCount <= 1
      && oldUnits.length === 1 && newUnits.length === 1) {
    return null;
  }

  // Match blocks by exact text+tag signature first; whatever's left between anchors
  // gets paired by similarity.
  const sig = (u) => `${u.kind}:${u.name}:${u.text}`;
  const oldSigs = oldUnits.map((u) => ({ signature: sig(u) }));
  const newSigs = newUnits.map((u) => ({ signature: sig(u) }));
  const blocks = getMatchingBlocks(oldSigs, newSigs);

  let out = '';
  let oi = 0;
  let ni = 0;
  for (const blk of blocks) {
    if (blk.ai > oi || blk.bi > ni) {
      out += pairAndDiffUnits(
        oldUnits.slice(oi, blk.ai),
        newUnits.slice(ni, blk.bi),
      );
    }
    for (let k = 0; k < blk.size; k += 1) {
      out += oldUnits[blk.ai + k].html;
    }
    oi = blk.ai + blk.size;
    ni = blk.bi + blk.size;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Compare two HTML strings and return diff markup using <ins class="diffins">
 * and <del class="diffdel">.
 */
// eslint-disable-next-line import/prefer-default-export
export function htmlDiff(oldHtml, newHtml) {
  if (oldHtml === newHtml) return oldHtml;
  if (!oldHtml) return newHtml ? wrap(newHtml, 'diffins') : '';
  if (!newHtml) return wrap(oldHtml, 'diffdel');

  const blockResult = diffByBlocks(oldHtml, newHtml);
  if (blockResult !== null) return blockResult;

  return inlineDiff(oldHtml, newHtml);
}
