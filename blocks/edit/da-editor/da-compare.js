import getSheet from '../../shared/sheet.js';
import { docToHtml, domToHtml, buildCompareDom, renderCompareModal } from '../../shared/version/compare.js';

let compareSheetPromise;
function loadCompareSheet() {
  if (!compareSheetPromise) {
    compareSheetPromise = getSheet('/blocks/shared/version/compare.css');
  }
  return compareSheetPromise;
}

export async function compare({ shadowRoot, versionDom, onClose, onResult }) {
  const [{ dom, cleanup }, compareSheet] = await Promise.all([
    buildCompareDom({
      htmlA: docToHtml(window.view),
      htmlB: versionDom ? domToHtml(versionDom) : '',
      onClose,
    }),
    loadCompareSheet(),
  ]);
  if (!shadowRoot.adoptedStyleSheets.includes(compareSheet)) {
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, compareSheet];
  }
  onResult(dom, cleanup);
}

export function renderModal(versionLabel, compareDom, onClose) {
  return renderCompareModal({
    title: 'Compare with current document',
    labelA: 'Current Document',
    labelB: `Version: ${versionLabel || ''}`,
    compareDom,
    onClose,
  });
}
