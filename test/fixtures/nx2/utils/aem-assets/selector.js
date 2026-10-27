export const ASSET_SELECTOR_URL = '/test/fixtures/asset-selector.js';

let selectorLoadResult;
export const selectorLoadCalls = [];

export const setSelectorLoadResult = (result) => { selectorLoadResult = result; };

export async function loadAssetSelector() {
  selectorLoadCalls.push(true);
  return selectorLoadResult ?? { selectors: window.PureJSSelectors };
}
