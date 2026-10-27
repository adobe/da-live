import { TextSelection } from 'da-y-wrapper';
import prose2aem from '../../shared/prose2aem.js';
import { wrapTablesInWrappers } from '../../shared/version/compare.js';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { daFetch, fetchDaConfigs, getFirstSheet } from '../../shared/utils.js';
import { toolbarController } from './toolbar-controller.js';
import {
  diffTopLevel,
  getRerenderScope,
  touchesMetadata,
  touchesUnrendered,
} from './rerender-scope.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';
import { canvasBus, registerEditorSelectEnricher } from '../utils/canvas-bus.js';
import { normalizeBranch } from '../utils/branch.js';

const { DA_CONTENT } = await import(`${getNx()}/utils/utils.js`);
const { getImageDocumentVersion } = await import(`${getNx2()}/public/utils/quick-edit-images.js`);

/**
 * Dispatch a transaction mirrored from the quick-edit iframe.
 *
 * `suppressRerender` stops the resulting update echoing straight back to the iframe
 * that produced it. The reset is in a `finally` deliberately: stranding the flag
 * `true` (a throw inside `dispatch`) silently stops the iframe receiving any
 * further body updates for the rest of the session.
 *
 * `mirroringFromIframe` marks the dispatch as iframe-originated for the (synchronous)
 * selection-tracking hook, so it doesn't scroll the iframe back to where the user
 * already is. Kept separate from `suppressRerender`, which block edit also holds.
 */
export function dispatchMirror(view, tr, ctx) {
  ctx.suppressRerender = true;
  ctx.mirroringFromIframe = true;
  try {
    view.dispatch(tr);
  } finally {
    ctx.suppressRerender = false;
    ctx.mirroringFromIframe = false;
  }
}

// syncedDoc includes SET_EDITOR_STATE pushes; confirmedDoc doesn't (a RELOAD means one failed).
function markPreviewSynced(ctx, { previousDoc, doc } = {}, { confirmed = false } = {}) {
  if (!previousDoc || !doc) return;
  if (touchesUnrendered(diffTopLevel(previousDoc, doc))) return;
  if (ctx.syncedDoc && ctx.syncedDoc === previousDoc) ctx.syncedDoc = doc;
  if (confirmed && ctx.confirmedDoc && ctx.confirmedDoc === previousDoc) ctx.confirmedDoc = doc;
}

// --- state.js ---

function findInsertedRange(oldText, newText) {
  if (newText.length <= oldText.length) return null;
  let prefixLen = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen += 1;
  return { start: prefixLen, end: prefixLen + (newText.length - oldText.length) };
}

const EDITABLES = [
  { selector: 'h1', nodeName: 'H1', nodeType: 'heading' },
  { selector: 'h2', nodeName: 'H2', nodeType: 'heading' },
  { selector: 'h3', nodeName: 'H3', nodeType: 'heading' },
  { selector: 'h4', nodeName: 'H4', nodeType: 'heading' },
  { selector: 'h5', nodeName: 'H5', nodeType: 'heading' },
  { selector: 'h6', nodeName: 'H6', nodeType: 'heading' },
  { selector: 'p', nodeName: 'P', nodeType: 'paragraph' },
  { selector: 'ol', nodeName: 'OL', nodeType: 'ordered_list' },
  { selector: 'ul', nodeName: 'UL', nodeType: 'bullet_list' },
  { selector: 'pre', nodeName: 'PRE', nodeType: 'code_block' },
  { selector: 'blockquote', nodeName: 'BLOCKQUOTE', nodeType: 'blockquote' },
];
const EDITABLE_SELECTORS = EDITABLES.map((edit) => edit.selector).join(', ');
const EDITABLE_NODE_TYPES = new Set(EDITABLES.map((edit) => edit.nodeType));

// Resolve the editable block the WYSIWYG should mount for a given prose index.
//
// Naively taking `resolve(before(depth)).nodeAfter` climbs to the enclosing
// `table_cell` when the index lands on the cell-content boundary (e.g. a block
// inside a table-backed block such as `cards`). The iframe then wraps it in a
// fresh doc via `schema.node('doc', [node])`, but a `table_cell` is not valid
// top-level `doc` content (`doc` is `block+`; a cell only belongs in a
// `table_row`), so it throws "Invalid content for node doc" and the editor dies.
//
// Match instrumentation's outermost editable element, not an inner heading or
// paragraph that would discard its quote/list wrapper. Tables are not editables.
export function resolveEditableNode(doc, cursorOffset) {
  const $pos = doc.resolve(cursorOffset);
  const docMatch = doc.type.schema.nodes.doc.contentMatch;

  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const ancestor = $pos.node(depth);
    if (EDITABLE_NODE_TYPES.has(ancestor.type.name)) {
      return { node: ancestor, cursorOffset: $pos.before(depth) + 1 };
    }
  }

  // The index sits at the boundary right before an editable block — e.g. inside
  // a table cell, immediately before its first block. The block is the node
  // after the index; keep the index so the placeholder still resolves.
  const after = $pos.nodeAfter;
  if (after && docMatch.matchType(after.type)) {
    return { node: after, cursorOffset };
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
      // Text offsets omit the structural positions inside quotes and lists.
      let textOffset = 0;
      node.descendants((child, offset) => {
        if (!child.isText) return;
        const from = Math.max(inserted.start, textOffset);
        const to = Math.min(inserted.end, textOffset + child.text.length);
        if (from < to) {
          const start = nodeStart + 1 + offset - textOffset;
          storedMarks.forEach((mark) => tr.addMark(start + from, start + to, mark));
        }
        textOffset += child.text.length;
      });
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
          payload: {
            editorState,
            cursorOffset,
            imageVersion: getImageDocumentVersion(view.state.doc),
          },
        });
      }
    } catch {
      // Non-fatal: position errors after structural changes
    }
  }
  ctx.port?.postMessage({
    type: MESSAGE_TYPES.NODE_UPDATE,
    payload: {
      nodeUpdateId: data.nodeUpdateId,
      imageVersion: getImageDocumentVersion(view.state.doc),
    },
  });
}

export function getEditor(data, ctx) {
  if (ctx.suppressRerender) {
    if (ctx.mirroringFromIframe) markPreviewSynced(ctx, data, { confirmed: true });
    return;
  }
  const { view } = ctx;
  const { cursorOffset, previousDoc } = data;
  if (typeof cursorOffset !== 'number') return;

  const { doc } = view.state;
  const maxPos = doc.content.size;
  if (cursorOffset < 0 || cursorOffset > maxPos) return;

  try {
    const { node, cursorOffset: newCursorOffset } = resolveEditableNode(doc, cursorOffset);
    if (!node) return;
    ctx.port.postMessage({
      type: MESSAGE_TYPES.SET_EDITOR_STATE,
      payload: {
        editorState: node.toJSON(),
        cursorOffset: newCursorOffset,
        imageVersion: getImageDocumentVersion(doc),
        lengthDiff: previousDoc ? doc.content.size - previousDoc.content.size : 0,
      },
    });
    markPreviewSynced(ctx, data);
  } catch {
    // Stale iframe cursor after structural replace (e.g. chat revert, remote sync).
  }
}

// --- document.js ---

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

// Merge-conflict node views render their own UI (tabs, buttons, overlays).
// Serialize what the author sees by default instead: the local version of a
// pair, the content of a lone node. The hidden second half of a pair goes.
// The node views render a block as a bare table, but prose2aem only turns a
// table inside a .tableWrapper into a block, so each table gets its wrapper back.
function unwrapDiffViews(root) {
  root.querySelectorAll('.loc-pair-hidden').forEach((el) => el.remove());
  root.querySelectorAll('.loc-tabbed-container').forEach((container) => {
    const local = container.querySelector('.diff-tab-pane[data-tab="added"]');
    if (!local) {
      container.remove();
      return;
    }
    wrapTablesInWrappers(local);
    container.replaceWith(...local.childNodes);
  });
  root.querySelectorAll('.loc-single-container').forEach((container) => {
    container.querySelectorAll(':scope > .loc-color-overlay').forEach((el) => el.remove());
    wrapTablesInWrappers(container);
    container.replaceWith(...container.childNodes);
  });
}

export function getInstrumentedHTML(view) {
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
    const isPageOrSectionMetadata = firstCellText === 'metadata' || firstCellText === 'section metadata' || firstCellText === 'section-metadata';
    const isLibraryMetadata = firstCellText === 'library metadata' || firstCellText === 'library-metadata';
    if (isPageOrSectionMetadata || isLibraryMetadata) return;
    const div = table.parentElement;
    const blockMarker = document.createElement('div');
    blockMarker.className = 'block-marker';
    try {
      const position = view.posAtDOM(originalTables[index], 0);
      blockMarker.setAttribute('data-prose-index', position);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not find position for table block:', e);
    }
    div.insertAdjacentElement('beforebegin', blockMarker);
  });

  const originalImages = view.dom.querySelectorAll('img');
  const clonedImages = editorClone.querySelectorAll('img');
  const imageVersion = getImageDocumentVersion(view.state.doc);
  originalImages.forEach((originalImage, index) => {
    if (originalImage.matches('.ProseMirror-separator, .ProseMirror-trailingBreak')) return;
    const clonedImage = clonedImages[index];
    if (!clonedImage) return;
    try {
      const pos = view.posAtDOM(originalImage, 0);
      clonedImage.setAttribute('data-image-index', pos);
      clonedImage.setAttribute('data-image-version', imageVersion);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not find position for image:', e);
    }
  });

  unwrapDiffViews(editorClone);

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
  let htmlString = prose2aem(editorClone, true, false);
  htmlString = htmlString.replace(
    /<div class="block-marker" data-prose-index="(\d+)"><\/div>\s*<div([^>]*?)>/gi,
    (_match, proseIndex, divAttributes) => `<div${divAttributes} data-block-index="${proseIndex}">`,
  );
  // Any marker that didn't pair with a wrapper would be decorated as a real block.
  htmlString = htmlString.replace(/<div class="block-marker"[^>]*><\/div>/gi, '');
  return htmlString;
}

export function getInstrumentedHTMLForSDK(view) {
  const doc = new DOMParser().parseFromString(getInstrumentedHTML(view), 'text/html');
  doc.querySelectorAll('[data-cursor-remote], [data-cursor-remote-color]').forEach((element) => {
    element.removeAttribute('data-cursor-remote');
    element.removeAttribute('data-cursor-remote-color');
  });
  doc.querySelectorAll('img[data-image-index]').forEach((image) => {
    try {
      const pos = Number(image.getAttribute('data-image-index'));
      const node = view.state.doc.nodeAt(pos);
      if (node?.type.name !== 'image') throw new Error(`No editor image at position ${pos}`);
      image.setAttribute('src', node.attrs.src);
      image.closest('picture')?.querySelectorAll('source').forEach((source) => {
        source.setAttribute('srcset', node.attrs.src);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not preserve original image URL:', e);
    }
  });
  return doc.body.outerHTML;
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

      if (isBlock) {
        flushRun();
        const rawProseIndex = el.getAttribute('data-block-index');
        const proseIndex = rawProseIndex != null ? Number(rawProseIndex) : undefined;
        const innerText = el.textContent?.trim() ?? '';
        // Classes after the block name are its variant(s) — the same descriptor the
        // doc editor's header row shows in parentheses (e.g. `cards (highlight)`).
        const variant = [...el.classList].slice(1).join(', ');
        const block = { name, variant, blockIndex: flatIndex, proseIndex, innerText };
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

const METADATA_RERENDER_DEBOUNCE_MS = 2000;

function clearMetadataRerenderTimer(ctx) {
  if (!ctx.metadataRerenderTimer) return;
  clearTimeout(ctx.metadataRerenderTimer);
  ctx.metadataRerenderTimer = undefined;
}

const getBaseline = (ctx) => (ctx.useConfirmedBaseline ? ctx.confirmedDoc : ctx.syncedDoc);

function postBody(ctx) {
  clearMetadataRerenderTimer(ctx);
  const { doc } = ctx.view.state;
  const body = getInstrumentedHTML(ctx.view);
  const rerenderScope = getRerenderScope({ previousDoc: getBaseline(ctx), doc, body });
  ctx.port.postMessage({ type: MESSAGE_TYPES.SET_BODY, payload: { body, rerenderScope } });
  ctx.syncedDoc = doc;
  ctx.confirmedDoc = doc;
  ctx.useConfirmedBaseline = false;
  return body;
}

export function updateDocument(ctx, { previousDoc, doc, useConfirmedBaseline = false } = {}) {
  if (ctx.suppressRerender) {
    if (ctx.mirroringFromIframe) markPreviewSynced(ctx, { previousDoc, doc }, { confirmed: true });
    return undefined;
  }
  if (useConfirmedBaseline) ctx.useConfirmedBaseline = true;
  const baseline = getBaseline(ctx);
  const trigger = previousDoc && doc
    ? diffTopLevel(previousDoc, doc)
    : baseline && diffTopLevel(baseline, ctx.view.state.doc);
  if (!baseline || !touchesMetadata(trigger)) return postBody(ctx);
  clearMetadataRerenderTimer(ctx);
  ctx.metadataRerenderTimer = setTimeout(() => {
    ctx.metadataRerenderTimer = undefined;
    if (!ctx.suppressRerender) postBody(ctx);
  }, METADATA_RERENDER_DEBOUNCE_MS);
  return getInstrumentedHTML(ctx.view);
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
  return `https://${normalizeBranch(branch)}--${repo}--${org}.${domain}`;
}

export async function fetchWysiwygBranch({ org, site, path }) {
  if (!org || !site) return 'main';
  const branchParam = new URLSearchParams(window.location.search).get('ref');
  if (branchParam && branchParam !== 'local') return normalizeBranch(branchParam);

  const configs = await Promise.all(fetchDaConfigs({ org, site }));
  const rows = configs.filter((c) => {
    if (c?.error) {
      // eslint-disable-next-line no-console
      console.warn(c.error, c.status);
      return false;
    }
    return Boolean(c);
  }).reverse().flatMap((c) => getFirstSheet(c) || []);
  const branchRows = rows.filter((r) => r?.key === 'ew.wysiwygBranch'
    && typeof r.value === 'string');
  if (!branchRows.length) return 'main';

  const fullPath = path ? `/${path}` : `/${org}/${site}`;
  const matched = branchRows
    .map((row) => {
      const eqIdx = row.value.indexOf('=');
      if (eqIdx === -1) return null;
      return {
        prefix: row.value.slice(0, eqIdx).replace(/\/+$/, ''),
        branch: row.value.slice(eqIdx + 1).trim(),
      };
    })
    .filter((entry) => entry?.branch
      && (fullPath === entry.prefix || fullPath.startsWith(`${entry.prefix}/`)))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return normalizeBranch(matched?.branch || 'main');
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
