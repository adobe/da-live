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
  const compareSheet = await loadCompareSheet();
  if (!shadowRoot.adoptedStyleSheets.includes(compareSheet)) {
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, compareSheet];
  }
  const { dom, cleanup } = buildCompareDom({
    htmlA: docToHtml(window.view),
    htmlB: versionDom ? domToHtml(versionDom) : '',
    onClose,
  });
  onResult(dom, cleanup);
}

export function renderModal(versionLabel, compareDom, onClose) {
  return renderCompareModal({
    labelA: 'Current Document',
    labelB: `Version: ${versionLabel || ''}`,
    compareDom,
    onClose,
  });
}
