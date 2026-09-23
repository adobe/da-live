function kindForTag(tagName) {
  if (/^H[1-6]$/.test(tagName)) return 'heading';
  if (tagName === 'OL' || tagName === 'UL') return 'list';
  if (tagName === 'PRE') return 'code';
  if (tagName === 'BLOCKQUOTE') return 'quote';
  return 'paragraph';
}

// Walks up from el to the nearest instrumented ancestor (data-block-index/data-image-
// index/data-prose-index -- see editor-utils.js's getInstrumentedHTML) and returns a
// location a preflight item can click through to. undefined when the doc wasn't sourced
// from canvas (no instrumentation at all) or el has no such ancestor.
export function locateElement(el) {
  let current = el;
  while (current) {
    if (current.hasAttribute?.('data-block-index')) {
      // Despite the name, this attribute holds the block's raw ProseMirror position (see
      // getInstrumentedHTML), not the ordinal index canvasBus.editorSelectState/
      // _scrollDocToBlock expect (parseSections' flatIndex / blocks.js's getBlockPositions
      // both count non-metadata blocks in doc order) -- re-derive that ordinal here.
      const blocks = [...current.ownerDocument.querySelectorAll('[data-block-index]')];
      return { blockIndex: blocks.indexOf(current) };
    }
    if (current.hasAttribute?.('data-image-index')) {
      return { proseIndex: Number(current.getAttribute('data-image-index')), kind: 'image' };
    }
    if (current.hasAttribute?.('data-prose-index')) {
      return { proseIndex: Number(current.getAttribute('data-prose-index')), kind: kindForTag(current.tagName) };
    }
    current = current.parentElement;
  }
  return undefined;
}

export function getMetadata(el) {
  if (!el) return {};
  return [...el.childNodes].reduce((rdx, row) => {
    if (row.children) {
      const key = row.children[0].textContent.trim().toLowerCase();
      const content = row.children[1];
      const text = content.textContent.trim().toLowerCase();
      if (key && content) rdx[key] = { content, text };
    }
    return rdx;
  }, {});
}
