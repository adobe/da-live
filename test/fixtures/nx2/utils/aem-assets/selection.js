export const MISSING_FORMAT_ERROR_MSG = 'missing-format';
export const DM_ERROR_MSG = 'not-approved';
export const PUBLISH_ERROR_MSG = 'not-published';

let nextSelection = {};
const perAssetSelections = new Map();
export const selectionCalls = [];

export const setSelection = (selection) => { nextSelection = selection; };

// Scripts a selection result for one specific asset object (by content), so a single
// test can drive multiple assets through different outcomes at once.
export const setSelectionFor = (asset, selection) => {
  perAssetSelections.set(JSON.stringify(asset), selection);
};

export const resetSelections = () => {
  nextSelection = {};
  perAssetSelections.clear();
  selectionCalls.length = 0;
};

export const resolveAssetSelection = (args) => {
  selectionCalls.push(args);
  const key = JSON.stringify(args.asset);
  if (perAssetSelections.has(key)) return perAssetSelections.get(key);
  return nextSelection;
};
