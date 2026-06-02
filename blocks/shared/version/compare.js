import { html } from 'da-lit';
import { DOMSerializer } from 'da-y-wrapper';
import { daFetch } from '../utils.js';
import { htmlDiff } from './htmldiff.js';

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

/**
 * Produce a diff DOM element from two HTML strings.
 *
 * @param {object} opts
 * @param {string} opts.htmlA - "before" HTML (shown as deleted)
 * @param {string} opts.htmlB - "after" HTML (shown as inserted)
 * @param {Function} opts.onClose - called when user clicks outside the modal
 * @returns {{ dom: HTMLElement, cleanup: Function }}
 */
/** Serialize a ProseMirror view's current document to a normalized HTML string. */
export function docToHtml(view) {
  const { schema, doc } = view.state;
  const frag = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const el = document.createElement('div');
  el.append(frag);
  wrapTablesInWrappers(el);
  stripEmptyTopLevelBlocks(el);
  return el.innerHTML;
}

/** Serialize an already-normalized DOM element to an HTML string. */
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

export function buildCompareDom({ htmlA, htmlB, onClose }) {
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

/**
 * Lit template for the compare modal.
 *
 * @param {object} opts
 * @param {string} opts.labelA - label for the "before" side (shown as deleted)
 * @param {string} opts.labelB - label for the "after" side (shown as inserted)
 * @param {HTMLElement} opts.compareDom - diff DOM from buildCompareDom
 * @param {Function} opts.onClose
 */
export function renderCompareModal({
  labelA, labelB, compareDom, onClose,
}) {
  return html`
    <div class="da-compare-backdrop">
      <div class="da-compare-modal" role="dialog" aria-label="Compare documents">
        <div class="da-compare-header">
          <div class="da-compare-header-text">
            <h2 class="da-compare-title">Compare</h2>
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
