import { TextSelection } from 'da-y-wrapper';
import prose2aem from '../../shared/prose2aem.js';
import { getNx } from '../../../scripts/utils.js';
import { daFetch, fetchDaConfigs, getFirstSheet } from '../../shared/utils.js';

const { DA_CONTENT } = await import(`${getNx()}/utils/utils.js`);

// --- state.js ---

function findInsertedRange(oldText, newText) {
  if (newText.length <= oldText.length) return null;
  let prefixLen = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen += 1;
  return { start: prefixLen, end: prefixLen + (newText.length - oldText.length) };
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
  const docPos = view.state.selection.from;

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

  tr.setSelection(TextSelection.create(tr.doc, docPos));

  ctx.suppressRerender = true;
  view.dispatch(tr);
  ctx.suppressRerender = false;

  // Sync the updated node (with marks applied) back to the portal's mini editor.
  // Without this, the portal's editor retains the plain-text version, so the next
  // character typed would send a node-update that overwrites the marks we just added
  // (replaceWith replaces the whole paragraph with the portal's plain content).
  if (appliedMarks && ctx.port) {
    try {
      const syncPos = view.state.doc.resolve(data.cursorOffset);
      const syncNodeStart = syncPos.before(syncPos.depth);
      const syncNode = view.state.doc.resolve(syncNodeStart).nodeAfter;
      if (syncNode) {
        ctx.port.postMessage({
          type: 'set-editor-state',
          editorState: syncNode.toJSON(),
          cursorOffset: data.cursorOffset,
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
    const pos = doc.resolve(cursorOffset);
    const before = pos.before(pos.depth);
    const beforePos = doc.resolve(before);
    const nodeAtBefore = beforePos.nodeAfter;
    if (!nodeAtBefore) return;
    ctx.port.postMessage({ type: 'set-editor-state', editorState: nodeAtBefore.toJSON(), cursorOffset: before + 1 });
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
    if (isPageOrSectionMetadata) return;
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
  let htmlString = prose2aem(editorClone, true, false, true);
  htmlString = htmlString.replace(
    /<div class="block-marker" data-prose-index="(\d+)"><\/div>\s*<div([^>]*?)>/gi,
    (_match, proseIndex, divAttributes) => `<div${divAttributes} data-block-index="${proseIndex}">`,
  );
  return htmlString;
}

const SKIP_BLOCK_CLASSES = new Set(['default-content-wrapper', 'metadata', 'block-marker']);

export function parseSections(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const container = doc.querySelector('main') ?? doc.body;
  let flatIndex = 0;
  return Array.from(container.querySelectorAll(':scope > div'), (section, sectionIndex) => {
    const blocks = [];
    Array.from(section.querySelectorAll(':scope > div[class]')).forEach((el) => {
      const name = el.classList[0];
      if (!name || SKIP_BLOCK_CLASSES.has(name)) return;
      const rawProseIndex = el.getAttribute('data-block-index');
      const proseIndex = rawProseIndex != null ? Number(rawProseIndex) : undefined;
      const innerText = el.textContent?.trim() ?? '';
      blocks.push({ name, blockIndex: flatIndex, proseIndex, innerText });
      flatIndex += 1;
    });
    return { sectionIndex, blocks };
  });
}

// State observable — replays last value on subscribe. See docs/canvas-events.md.
export const editorHtmlChange = (() => {
  const listeners = new Set();
  let currentHtml = '';
  return {
    emit(html) {
      currentHtml = html;
      listeners.forEach((fn) => fn(html));
    },
    subscribe(fn) {
      listeners.add(fn);
      if (currentHtml) fn(currentHtml);
      return () => listeners.delete(fn);
    },
  };
})();

// Event observable — no replay on subscribe. See docs/canvas-events.md.
// emit() enriches the detail with blockName/proseIndex/innerText from the last parsed HTML.
export const editorSelectChange = (() => {
  const listeners = new Set();
  let blockMeta = new Map();

  editorHtmlChange.subscribe((html) => {
    if (!html.trim()) {
      blockMeta = new Map();
      return;
    }
    const next = new Map();
    for (const { blocks } of parseSections(html)) {
      for (const { name, blockIndex, proseIndex, innerText } of blocks) {
        next.set(blockIndex, { name, proseIndex, innerText });
      }
    }
    blockMeta = next;
  });

  return {
    emit(detail) {
      const meta = blockMeta.get(detail.blockIndex);
      const { name: blockName, proseIndex, innerText } = meta || {};
      const enriched = meta
        ? { ...detail, blockName, proseIndex, innerText }
        : detail;
      listeners.forEach((fn) => fn(enriched));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();

export function updateDocument(ctx) {
  if (ctx.suppressRerender) return undefined;
  const body = getInstrumentedHTML(ctx.view);
  ctx.port.postMessage({ type: 'set-body', body });
  return body;
}

export function updateCursors(ctx) {
  const cursors = extractCursors(ctx.view);
  ctx.port.postMessage({ type: 'set-cursors', cursors });
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
