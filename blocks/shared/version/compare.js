import { html } from 'da-lit';
import { DOMSerializer } from 'da-y-wrapper';
import { daFetch } from '../utils.js';

export function wrapTablesInWrappers(root) {
  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('tableWrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'tableWrapper';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });
}

export function stripEmptyTopLevelBlocks(root) {
  const isWhitespace = (s) => !s || /^\s*$/.test(s);
  Array.from(root.children).forEach((child) => {
    const hasMedia = child.querySelector('img, video, table, hr, iframe, svg');
    if (!hasMedia && isWhitespace(child.textContent)) child.remove();
  });
}

export function docToHtml(view) {
  const { schema, doc } = view.state;
  const frag = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const el = document.createElement('div');
  el.append(frag);
  wrapTablesInWrappers(el);
  stripEmptyTopLevelBlocks(el);
  return el.innerHTML;
}

export function domToHtml(el) {
  const clone = el.cloneNode(true);
  stripEmptyTopLevelBlocks(clone);
  return clone.innerHTML;
}

/**
 * Fetch a version URL and return a normalized DOM element via ProseMirror.
 * Returns null if the fetch fails.
 */
export async function fetchVersionDom(url) {
  const resp = await daFetch(url);
  if (!resp.ok) return null;
  const rawHtml = await resp.text();
  const { Y } = await import('da-y-wrapper');
  const { aem2doc, getSchema, yDocToProsemirror } = await import('da-parser');
  const ydoc = new Y.Doc();
  aem2doc(rawHtml, ydoc);
  const schema = getSchema();
  const pmDoc = yDocToProsemirror(schema, ydoc);
  const frag = DOMSerializer.fromSchema(schema).serializeFragment(pmDoc.content);
  const el = document.createElement('div');
  el.append(frag);
  stripEmptyTopLevelBlocks(el);
  return el;
}

export async function buildCompareDom({ htmlA, htmlB, onClose }) {
  const { htmlDiff } = await import('./htmldiff.js');
  const dom = document.createElement('div');
  dom.className = 'ProseMirror';
  dom.innerHTML = htmlDiff(htmlA, htmlB);
  wrapTablesInWrappers(dom);

  const onDocClick = (ev) => {
    const insideModal = ev.composedPath().some((n) => n?.classList?.contains?.('da-compare-modal'));
    if (!insideModal) onClose();
  };
  const cleanup = () => document.removeEventListener('click', onDocClick, true);
  setTimeout(() => document.addEventListener('click', onDocClick, true), 0);

  return { dom, cleanup };
}

export function renderCompareModal({ title = 'Compare', labelA, labelB, compareDom, onClose }) {
  return html`
    <div class="da-compare-backdrop">
      <div class="da-compare-modal" role="dialog" aria-label="${title}">
        <div class="da-compare-header">
          <div class="da-compare-header-text">
            <h2 class="da-compare-title">${title}</h2>
            <div class="da-compare-key">
              <del class="diffdel">${labelA}</del>
              <ins class="diffins">${labelB}</ins>
            </div>
          </div>
          <button class="da-compare-close" aria-label="Close" @click=${onClose}>&times;</button>
        </div>
        <div class="da-compare-body">${compareDom}</div>
      </div>
    </div>`;
}
