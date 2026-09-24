import { TextSelection } from 'da-y-wrapper';
import prose2aem from '../../shared/prose2aem.js';
import { getNx } from '../../../scripts/utils.js';
import { daFetch, fetchDaConfigs, getFirstSheet } from '../../shared/utils.js';
import { toolbarController } from './toolbar-controller.js';
import { getTableInfo } from './blocks.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';
import { canvasBus, registerEditorSelectEnricher } from '../utils/canvas-bus.js';

const { DA_CONTENT } = await import(`${getNx()}/utils/utils.js`);

/**
 * Dispatch a transaction mirrored from the quick-edit iframe.
 *
 * `suppressRerender` stops the resulting update echoing straight back to the iframe
 * that produced it. The reset is in a `finally` deliberately: stranding the flag
 * `true` (a throw inside `dispatch`) silently stops the iframe receiving any
 * further body updates for the rest of the session.
 */
export function dispatchMirror(view, tr, ctx) {
  ctx.suppressRerender = true;
  try {
    view.dispatch(tr);
  } finally {
    ctx.suppressRerender = false;
  }
}

// --- state.js ---

function findInsertedRange(oldText, newText) {
  if (newText.length <= oldText.length) return null;
  let prefixLen = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen += 1;
  return { start: prefixLen, end: prefixLen + (newText.length - oldText.length) };
}

// Resolve the editable block the WYSIWYG should mount for a given prose index.
//
// Naively taking `resolve(before(depth)).nodeAfter` climbs to the enclosing
// `table_cell` when the index lands on the cell-content boundary (e.g. a block
// inside a table-backed block such as `cards`). The iframe then wraps it in a
// fresh doc via `schema.node('doc', [node])`, but a `table_cell` is not valid
// top-level `doc` content (`doc` is `block+`; a cell only belongs in a
// `table_row`), so it throws "Invalid content for node doc" and the editor dies.
//
// Return the block that actually corresponds to the index (paragraph / heading /
// list), never its table container, and preserve the index for the
// `data-prose-index` roundtrip.
export function resolveEditableNode(doc, cursorOffset) {
  const $pos = doc.resolve(cursorOffset);
  const docMatch = doc.type.schema.nodes.doc.contentMatch;

  // The index sits at the boundary right before an editable block — e.g. inside
  // a table cell, immediately before its first block. The block is the node
  // after the index; keep the index so the placeholder still resolves.
  const after = $pos.nodeAfter;
  if (after && docMatch.matchType(after.type)) {
    return { node: after, cursorOffset };
  }

  // The index sits inside an editable block. Climb to the innermost ancestor
  // that is valid top-level `doc` content — never a `table_cell` / `table_row`.
  const { depth } = $pos;
  for (let d = depth; d >= 1; d -= 1) {
    const ancestor = $pos.node(d);
    if (docMatch.matchType(ancestor.type)) {
      return { node: ancestor, cursorOffset: $pos.before(d) + 1 };
    }
  }

  return { node: null, cursorOffset };
}

export function updateState(data, ctx) {
  const { view } = ctx;
  // Capture stored marks before the transaction — these are marks the user toggled
  // (e.g. Bold) that ProseMirror is holding for the next character typed.  In
  // WYSIWYG mode, keystrokes go to the iframe so ProseMirror's normal mark
  // application on input never runs; we must apply them ourselves here.
  const { storedMarks } = view.state;
  const node = view.state.schema.nodeFromJSON(data.node);
  const pos = view.state.doc.resolve(data.cursorOffset);
  // Preserve a range selection (e.g. toggling Bold on selected text) rather than
  // always collapsing to a point — collapsing loses the range when nothing moves
  // the selection afterward (no CURSOR_MOVE follows a mark-only edit).
  const { from: selFrom, to: selTo } = view.state.selection;

  const nodeStart = pos.before(pos.depth);
  const nodeEnd = pos.after(pos.depth);

  const { tr } = view.state;
  tr.replaceWith(nodeStart, nodeEnd, node);

  let appliedMarks = false;
  if (storedMarks?.length) {
    const oldText = view.state.doc.textBetween(nodeStart, nodeEnd);
    const inserted = findInsertedRange(oldText, node.textContent);
    if (inserted) {
      // In ProseMirror each text character occupies one position unit, so
      // text offset i maps to doc position nodeStart + 1 + i.
      const markFrom = nodeStart + 1 + inserted.start;
      const markTo = nodeStart + 1 + inserted.end;
      storedMarks.forEach((mark) => tr.addMark(markFrom, markTo, mark));
      // Preserve stored marks so continued typing stays in the same formatting state.
      tr.setStoredMarks(storedMarks);
      appliedMarks = true;
    }
  }

  const maxPos = tr.doc.content.size;
  const restoredFrom = Math.min(selFrom, maxPos);
  const restoredTo = Math.min(selTo, maxPos);
  tr.setSelection(TextSelection.create(tr.doc, restoredFrom, restoredTo));

  dispatchMirror(view, tr, ctx);

  toolbarController.refresh();

  // Sync the updated node (with marks applied) back to the portal's mini editor.
  // Without this, the portal's editor retains the plain-text version, so the next
  // character typed would send a node-update that overwrites the marks we just added
  // (replaceWith replaces the whole paragraph with the portal's plain content).
  if (appliedMarks && ctx.port) {
    try {
      const { node: syncNode } = resolveEditableNode(view.state.doc, data.cursorOffset);
      if (syncNode) {
        const editorState = syncNode.toJSON();
        const { cursorOffset } = data;
        ctx.port.postMessage({
          type: MESSAGE_TYPES.SET_EDITOR_STATE,
          payload: { editorState, cursorOffset },
        });
      }
    } catch {
      // Non-fatal: position errors after structural changes
    }
  }
}

export function getEditor(data, ctx) {
  if (ctx.suppressRerender) return;
  const { view } = ctx;
  const { cursorOffset } = data;
  if (typeof cursorOffset !== 'number') return;

  const { doc } = view.state;
  const maxPos = doc.content.size;
  if (cursorOffset < 0 || cursorOffset > maxPos) return;

  try {
    const { node, cursorOffset: newCursorOffset } = resolveEditableNode(doc, cursorOffset);
    if (!node) return;
    ctx.port.postMessage({
      type: MESSAGE_TYPES.SET_EDITOR_STATE,
      payload: { editorState: node.toJSON(), cursorOffset: newCursorOffset },
    });
  } catch {
    // Stale iframe cursor after structural replace (e.g. chat revert, remote sync).
  }
}

// --- document.js ---

const EDITABLES = [
  { selector: 'h1', nodeName: 'H1' },
  { selector: 'h2', nodeName: 'H2' },
  { selector: 'h3', nodeName: 'H3' },
  { selector: 'h4', nodeName: 'H4' },
  { selector: 'h5', nodeName: 'H5' },
  { selector: 'h6', nodeName: 'H6' },
  { selector: 'p', nodeName: 'P' },
  { selector: 'ol', nodeName: 'OL' },
  { selector: 'ul', nodeName: 'UL' },
  { selector: 'pre', nodeName: 'PRE' },
  { selector: 'blockquote', nodeName: 'BLOCKQUOTE' },
];
const EDITABLE_SELECTORS = EDITABLES.map((edit) => edit.selector).join(', ');

export function isOutermostWysiwygEditable(el) {
  if (!el?.matches?.(EDITABLE_SELECTORS)) return false;
  return !el.parentElement?.closest(EDITABLE_SELECTORS);
}

export function extractCursors(view) {
  const remoteCursors = view.dom.querySelectorAll('.ProseMirror-yjs-cursor');
  const cursorMap = new Map();

  remoteCursors.forEach((remoteCursor) => {
    let highestEditable = null;
    let current = remoteCursor.parentElement;

    while (current) {
      if (current.matches?.(EDITABLE_SELECTORS)) {
        highestEditable = current;
      }
      current = current.parentElement;
    }

    if (!highestEditable) return;

    try {
      const proseIndex = view.posAtDOM(highestEditable, 0);
      cursorMap.set(proseIndex, {
        proseIndex,
        remote: remoteCursor.innerText,
        color: remoteCursor.style['border-color'],
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not find position for remote cursor:', e);
    }
  });

  return [...cursorMap.values()];
}

export function getInstrumentedHTML(view, { livePreview = true } = {}) {
  const editorClone = view.dom.cloneNode(true);

  const originalElements = view.dom.querySelectorAll(EDITABLE_SELECTORS);
  const clonedElements = editorClone.querySelectorAll(EDITABLE_SELECTORS);

  originalElements.forEach((originalElement, index) => {
    if (!isOutermostWysiwygEditable(originalElement)) return;
    if (clonedElements[index]) {
      try {
        const editableElementStartPos = view.posAtDOM(originalElement, 0);
        clonedElements[index].setAttribute('data-prose-index', editableElementStartPos);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not find position for element:', e);
      }
    }
  });

  // Block instrumentation (same as da-nx qe-advanced): wrap blocks (e.g. tables), add a
  // sentinel with data-prose-index, then after serialization move it to wrapper as data-block-index
  const originalTables = view.dom.querySelectorAll('table');
  const clonedTables = editorClone.querySelectorAll('table');
  clonedTables.forEach((table, index) => {
    const firstRow = table.querySelector('tr');
    const firstCellText = firstRow?.cells?.[0]?.textContent?.trim().toLowerCase();
    const isLibraryMetadata = firstCellText === 'library metadata' || firstCellText === 'library-metadata';
    if (isLibraryMetadata) return;
    const div = table.parentElement;
    const blockMarker = document.createElement('div');
    blockMarker.className = 'block-marker';
    try {
      const position = view.posAtDOM(originalTables[index], 0);
      const tableNode = view.state.doc.resolve(position).parent;
      blockMarker.setAttribute('data-prose-index', position);
      // The block's real close, not just "until the next item" — a trailing empty
      // paragraph after the block has no item of its own, so without this it gets
      // misattributed to the block instead of the section.
      blockMarker.setAttribute('data-block-end', position - 1 + tableNode.nodeSize);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not find position for table block:', e);
    }
    div.insertAdjacentElement('beforebegin', blockMarker);
  });

  const originalImages = view.dom.querySelectorAll('img');
  const clonedImages = editorClone.querySelectorAll('img');
  originalImages.forEach((originalImage, index) => {
    if (originalImage.matches('.ProseMirror-separator, .ProseMirror-trailingBreak')) return;
    const clonedImage = clonedImages[index];
    if (!clonedImage) return;
    try {
      const pos = view.posAtDOM(originalImage, 0);
      clonedImage.setAttribute('data-image-index', pos);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not find position for image:', e);
    }
  });

  const remoteCursors = editorClone.querySelectorAll('.ProseMirror-yjs-cursor');

  remoteCursors.forEach((remoteCursor) => {
    let highestEditable = null;
    let current = remoteCursor.parentElement;

    while (current) {
      if (current.hasAttribute('data-prose-index')) {
        highestEditable = current;
      }
      current = current.parentElement;
    }

    if (highestEditable) {
      highestEditable.setAttribute('data-cursor-remote', remoteCursor.innerText);
      highestEditable.setAttribute('data-cursor-remote-color', remoteCursor.style['border-color']);
    }
  });

  // Serialize clone to HTML, then move block-marker index onto wrapper as data-block-index
  // (same pattern as da-nx qe-advanced: getInstrumentedHTML in prose2aem.js).
  let htmlString = prose2aem(editorClone, livePreview, false);
  htmlString = htmlString.replace(
    /<div class="block-marker" data-prose-index="(\d+)" data-block-end="(\d+)"><\/div>\s*<div([^>]*?)>/gi,
    (_match, proseIndex, blockEnd, divAttributes) => `<div${divAttributes} data-block-index="${proseIndex}" data-block-end="${blockEnd}">`,
  );
  return htmlString;
}

const SKIP_BLOCK_CLASSES = new Set(['default-content-wrapper', 'metadata', 'section-metadata', 'library-metadata', 'block-marker']);

function hasDefaultContent(el) {
  if (el.textContent?.trim()) return true;
  return el.matches?.('img') || !!el.querySelector?.('img');
}

function getDefaultContentProseIndex(el, kind) {
  // A <p> wrapping an image keeps its own data-prose-index, but only the nested
  // data-image-index resolves to the image node (prose2aem leaves the <p> unless the
  // image is the section's sole child), so for kind 'image' it must win.
  if (kind === 'image') {
    const nestedImage = el.querySelector('[data-image-index]');
    if (nestedImage) return Number(nestedImage.getAttribute('data-image-index'));
  }
  const own = el.getAttribute('data-prose-index') ?? el.getAttribute('data-image-index');
  if (own != null) return Number(own);
  const nested = el.querySelector('[data-prose-index], [data-image-index]');
  if (!nested) return undefined;
  const attr = nested.getAttribute('data-prose-index') ?? nested.getAttribute('data-image-index');
  return attr != null ? Number(attr) : undefined;
}

function firstLineText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return clone.textContent.trim().split('\n')[0].trim();
}

function getContentSnippet(el, kind) {
  if (kind === 'list') return firstLineText(el.querySelector(':scope > li') ?? el);
  if (kind === 'quote') return firstLineText(el.querySelector(':scope > p') ?? el);
  return firstLineText(el);
}

function getDefaultContentKind(el) {
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) return { kind: 'heading', level: Number(tag[1]) };
  if (tag === 'OL') return { kind: 'list', ordered: true };
  if (tag === 'UL') return { kind: 'list', ordered: false };
  if (tag === 'PRE') return { kind: 'code' };
  if (tag === 'BLOCKQUOTE') return { kind: 'quote' };
  if (el.textContent?.trim()) return { kind: 'paragraph' };
  // A text-less <p> wraps only an image, as does a bare <picture>/<img> — but a text-less
  // <p> with no image at all is just an empty paragraph, not an image wrapper.
  if (el.matches?.('img') || el.querySelector?.('img')) return { kind: 'image' };
  return { kind: 'paragraph' };
}

export function parseSections(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const container = doc.querySelector('main') ?? doc.body;
  let flatIndex = 0;
  return Array.from(container.querySelectorAll(':scope > div'), (section, sectionIndex) => {
    const blocks = [];
    const items = [];
    let currentRun = [];

    const flushRun = () => {
      if (currentRun.length) {
        items.push({
          type: 'content',
          proseIndex: getDefaultContentProseIndex(currentRun[0]),
          innerText: currentRun.map((el) => el.textContent.trim()).filter(Boolean).join(' '),
          children: currentRun.map((el) => {
            const kindInfo = getDefaultContentKind(el);
            return {
              type: 'content',
              ...kindInfo,
              proseIndex: getDefaultContentProseIndex(el, kindInfo.kind),
              innerText: el.textContent.trim(),
              snippet: getContentSnippet(el, kindInfo.kind),
            };
          }),
        });
      }
      currentRun = [];
    };

    Array.from(section.children).forEach((el) => {
      const name = el.tagName === 'DIV' ? el.classList[0] : undefined;
      const isBlock = name && !SKIP_BLOCK_CLASSES.has(name);

      if (name === 'metadata' || name === 'section-metadata') {
        flushRun();
        const rawProseIndex = el.getAttribute('data-block-index');
        items.push({
          type: 'metadata',
          name,
          proseIndex: rawProseIndex != null ? Number(rawProseIndex) : undefined,
        });
        return;
      }

      if (isBlock) {
        flushRun();
        const rawProseIndex = el.getAttribute('data-block-index');
        const proseIndex = rawProseIndex != null ? Number(rawProseIndex) : undefined;
        const rawBlockEnd = el.getAttribute('data-block-end');
        const blockEnd = rawBlockEnd != null ? Number(rawBlockEnd) : undefined;
        const innerText = el.textContent?.trim() ?? '';
        // Classes after the block name are its variant(s) — the same descriptor the
        // doc editor's header row shows in parentheses (e.g. `cards (highlight)`).
        const variant = [...el.classList].slice(1).join(', ');
        const block = {
          name, variant, blockIndex: flatIndex, proseIndex, blockEnd, innerText,
        };
        blocks.push(block);
        items.push({ type: 'block', ...block });
        flatIndex += 1;
        return;
      }

      // Skip empty nodes — prose2aem doesn't always strip them (e.g. an empty <h2> can
      // survive serialization) — so they neither break nor join a run.
      if (hasDefaultContent(el)) currentRun.push(el);
    });
    flushRun();

    return { sectionIndex, name: section.getAttribute('data-section-name') || '', blocks, items };
  });
}

export function resolveChangedScope({ changes, sections, previousSections = sections }) {
  const resolveOwner = (pos, ownerSections) => {
    const items = ownerSections.flatMap((section) => section.items.map((item) => ({
      sectionIndex: section.sectionIndex,
      item,
    })));
    const itemIndex = items.findIndex(({ item }, index) => {
      const nextItem = items[index + 1]?.item;
      return pos >= item.proseIndex && (nextItem == null || pos < nextItem.proseIndex);
    });

    if (itemIndex < 0) return null;

    const { sectionIndex, item } = items[itemIndex];
    // A block only owns positions up to its own close — the gap between a block's end and
    // the next item (e.g. a trailing empty paragraph, which has no item of its own) belongs
    // to the section, not the preceding block.
    if (item.type === 'block' && item.blockEnd != null && pos >= item.blockEnd) {
      return { sectionIndex, block: undefined, metadataName: undefined };
    }
    return {
      sectionIndex,
      block: item.type === 'block'
        ? { sectionIndex, blockIndex: item.blockIndex }
        : undefined,
      metadataName: item.type === 'metadata' ? item.name : undefined,
    };
  };

  const owners = changes.map((change) => resolveOwner(
    change.pos,
    change.type === 'deleted' ? previousSections : sections,
  ));
  if (owners.some((owner) => owner == null)) return null;

  const sectionIndexes = [...new Set(owners.map(({ sectionIndex }) => sectionIndex))];
  const blocks = [...new Map(
    owners
      .filter(({ block }) => block)
      .map(({ block }) => [block.blockIndex, block]),
  ).values()];
  const metadataNames = [...new Set(
    owners.map(({ metadataName }) => metadataName).filter(Boolean),
  )];

  return { sectionIndexes, blocks, metadataNames };
}

let selectBlockMeta = new Map();
canvasBus.editorHtmlState.subscribe((html) => {
  if (!html.trim()) {
    selectBlockMeta = new Map();
    return;
  }
  const next = new Map();
  for (const { blocks } of parseSections(html)) {
    for (const { name, blockIndex, proseIndex, innerText } of blocks) {
      next.set(blockIndex, { name, proseIndex, innerText });
    }
  }
  selectBlockMeta = next;
});

// Runs once, at load, so canvas-bus.js's editorSelectState.emit is enriched for
// every caller from here on — see canvas-bus.js for why this file owns the lookup.
registerEditorSelectEnricher((detail) => {
  const meta = selectBlockMeta.get(detail.blockIndex);
  if (!meta) return detail;
  const { name: blockName, proseIndex, innerText } = meta;
  return { ...detail, blockName, proseIndex, innerText };
});

function getRerenderScope(details, body) {
  if (!details || !body) return { type: 'page' };

  const sections = parseSections(body);
  const owners = resolveChangedScope({
    changes: details.changes,
    sections,
  });
  if (!owners) return { type: 'page' };
  if (owners.metadataNames.includes('section-metadata') && owners.sectionIndexes.length === 1) {
    return { type: 'section', sectionIndex: owners.sectionIndexes[0] };
  }
  if (owners.metadataNames.includes('metadata')) return { type: 'page' };

  const changeOwners = details.changes.map((change) => resolveChangedScope({
    changes: [change],
    sections,
  }));
  const [block] = owners.blocks;
  if (owners.blocks.length === 1 && changeOwners.every((owner) => owner?.blocks.length === 1)) {
    return { type: 'block', ...block };
  }
  if (owners.sectionIndexes.length === 1) {
    return { type: 'section', sectionIndex: owners.sectionIndexes[0] };
  }
  return { type: 'page' };
}

const METADATA_RERENDER_DEBOUNCE_MS = 2000;
const METADATA_TABLE_NAMES = new Set(['metadata', 'section-metadata']);

function getSelectionMetadataDetails(ctx) {
  const { state } = ctx.view ?? {};
  const pos = state?.selection?.from;
  if (typeof pos !== 'number') return undefined;
  const tableName = getTableInfo(state, pos)?.tableName?.trim().toLowerCase();
  if (!METADATA_TABLE_NAMES.has(tableName)) return undefined;
  return { changes: [{ type: 'selection', pos }] };
}

function isMetadataRerender(details, body) {
  if (!details || !body) return false;
  const owners = resolveChangedScope({
    changes: details.changes,
    sections: parseSections(body),
  });
  return owners?.metadataNames.some((name) => name === 'metadata' || name === 'section-metadata') === true;
}

function postBody(ctx, body, rerenderScope) {
  ctx.port.postMessage({ type: MESSAGE_TYPES.SET_BODY, payload: { body, rerenderScope } });
}

function clearMetadataRerenderTimer(ctx) {
  if (!ctx.metadataRerenderTimer) return;
  clearTimeout(ctx.metadataRerenderTimer);
  ctx.metadataRerenderTimer = undefined;
}

function flushMetadataRerender(ctx) {
  const pending = ctx.metadataRerender;
  if (!pending) return;
  clearMetadataRerenderTimer(ctx);
  ctx.metadataRerender = undefined;
  postBody(ctx, pending.body, pending.rerenderScope);
}

export function updateDocument(ctx, details) {
  if (ctx.suppressRerender) return undefined;
  const body = getInstrumentedHTML(ctx.view);
  const fallbackDetails = details ?? getSelectionMetadataDetails(ctx);
  const scopeBody = fallbackDetails ? getInstrumentedHTML(ctx.view, { livePreview: false }) : body;
  const rerenderScope = getRerenderScope(fallbackDetails, scopeBody);
  if (isMetadataRerender(fallbackDetails, scopeBody)) {
    clearMetadataRerenderTimer(ctx);
    ctx.metadataRerender = { body, rerenderScope };
    ctx.metadataRerenderTimer = setTimeout(() => {
      ctx.metadataRerenderTimer = undefined;
      flushMetadataRerender(ctx);
    }, METADATA_RERENDER_DEBOUNCE_MS);
  } else {
    flushMetadataRerender(ctx);
    postBody(ctx, body, rerenderScope);
  }
  return body;
}

export function updateCursors(ctx) {
  const cursors = extractCursors(ctx.view);
  ctx.port.postMessage({ type: MESSAGE_TYPES.SET_CURSORS, payload: { cursors } });
}

// --- preview.js ---

export function getPreviewOrigin(org, repo, branch = 'main') {
  const hostname = window?.location?.hostname ?? '';
  const domain = hostname.endsWith('aem.page') || hostname.endsWith('localhost')
    ? 'stage-preview.da.live'
    : 'preview.da.live';
  return `https://${branch}--${repo}--${org}.${domain}`;
}

export async function fetchWysiwygBranch({ org, site, path }) {
  if (!org || !site) return 'main';
  const branchParam = new URLSearchParams(window.location.search).get('ref');
  if (branchParam) return branchParam;

  try {
    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    const rows = configs.filter(Boolean).reverse().flatMap((c) => getFirstSheet(c) || []);
    const branchRows = rows.filter((r) => r.key === 'ew.wysiwygBranch');
    if (!branchRows.length) return 'main';

    const fullPath = path ? `/${path}` : `/${org}/${site}`;
    const matched = branchRows
      .map((row) => {
        const eqIdx = row.value.indexOf('=');
        if (eqIdx === -1) return null;
        return { prefix: row.value.slice(0, eqIdx), branch: row.value.slice(eqIdx + 1).trim() };
      })
      .filter((entry) => entry?.branch && fullPath.startsWith(entry.prefix))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];

    return matched?.branch || 'main';
  } catch (e) {
    if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
  }
  return 'main';
}

export async function fetchWysiwygCookie({ org, repo, token, branch = 'main' }) {
  if (!org || !repo || !token) {
    throw new Error('fetchWysiwygCookie: org, repo, and token required');
  }
  const previewUrl = `${getPreviewOrigin(org, repo, branch)}/gimme_cookie`;
  const contentUrl = `${DA_CONTENT}/${org}/${repo}/.gimme_cookie`;

  const previewResp = await daFetch(previewUrl, { method: 'GET', credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
  if (!previewResp.ok) {
    throw new Error(`gimme_cookie preview failed: status ${previewResp.status}`);
  }

  try {
    const contentResp = await fetch(contentUrl, { method: 'GET', credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
    if (!contentResp.ok) {
      // eslint-disable-next-line no-console
      console.warn('[canvas:wysiwyg] content gimme_cookie non-ok (non-fatal)', contentResp.status);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[canvas:wysiwyg] content gimme_cookie failed (non-fatal)', e?.message);
  }
}
