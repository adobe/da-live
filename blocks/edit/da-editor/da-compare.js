import { DOMSerializer } from 'da-y-wrapper';
import { html } from 'da-lit';
import getSheet from '../../shared/sheet.js';

let compareSheetPromise;
function loadCompareSheet() {
  if (!compareSheetPromise) {
    compareSheetPromise = getSheet('/blocks/edit/da-editor/da-compare.css');
  }
  return compareSheetPromise;
}

function wrapTablesInWrappers(root) {
  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('tableWrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'tableWrapper';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });
}

function stripEmptyTopLevelBlocks(root) {
  const isWhitespace = (s) => !s || /^\s*$/.test(s);
  Array.from(root.children).forEach((child) => {
    const hasMedia = child.querySelector('img, video, table, hr, iframe, svg');
    if (!hasMedia && isWhitespace(child.textContent)) child.remove();
  });
}

/**
 * @param {object} opts
 * @param {ShadowRoot} opts.shadowRoot
 * @param {Element|null} opts.versionDom
 * @param {Function} opts.onClose
 * @param {Function} opts.onResult - called with (compareDom, cleanup)
 */
export async function compare({ shadowRoot, versionDom, onClose, onResult }) {
  const { schema, doc } = window.view.state;
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const liveContainer = document.createElement('div');
  liveContainer.append(fragment);
  wrapTablesInWrappers(liveContainer);
  stripEmptyTopLevelBlocks(liveContainer);
  const liveHtml = liveContainer.innerHTML;

  let versionHtml = '';
  if (versionDom) {
    const versionContainer = versionDom.cloneNode(true);
    stripEmptyTopLevelBlocks(versionContainer);
    versionHtml = versionContainer.innerHTML;
  }

  const [{ htmlDiff }, compareSheet] = await Promise.all([
    import('../prose/diff/htmldiff.js'),
    loadCompareSheet(),
  ]);

  if (!shadowRoot.adoptedStyleSheets.includes(compareSheet)) {
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, compareSheet];
  }

  const dom = document.createElement('div');
  dom.className = 'ProseMirror';
  dom.innerHTML = htmlDiff(liveHtml, versionHtml);
  wrapTablesInWrappers(dom);

  const onDocClick = (ev) => {
    const insideModal = ev.composedPath().some((n) => n?.classList?.contains?.('da-compare-modal'));
    if (!insideModal) onClose();
  };

  const cleanup = () => document.removeEventListener('click', onDocClick, true);

  setTimeout(() => document.addEventListener('click', onDocClick, true), 0);

  onResult(dom, cleanup);
}

export function renderModal(versionLabel, compareDom, onClose) {
  return html`
    <div class="da-compare-backdrop">
      <div class="da-compare-modal" role="dialog" aria-label="Compare with current document">
        <div class="da-compare-header">
          <div class="da-compare-header-text">
            <h2 class="da-compare-title">Compare with current document</h2>
            <div class="da-compare-key">
              <del class="diffdel">Current Document</del>
              <ins class="diffins">Version: ${versionLabel || ''}</ins>
            </div>
          </div>
          <button class="da-compare-close" aria-label="Close" @click=${onClose}>&times;</button>
        </div>
        <div class="da-compare-body">${compareDom}</div>
      </div>
    </div>`;
}
