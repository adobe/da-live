/* eslint-disable import/no-unresolved -- prose2aem from da.live */
import prose2aem from 'https://da.live/blocks/shared/prose2aem.js';
/* eslint-enable import/no-unresolved */

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
export const editorSelectChange = (() => {
  const listeners = new Set();
  return {
    emit(detail) { listeners.forEach((fn) => fn(detail)); },
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
