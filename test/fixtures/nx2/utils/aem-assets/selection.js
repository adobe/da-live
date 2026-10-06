export const MISSING_FORMAT_ERROR_MSG = 'missing-format';
export const DM_ERROR_MSG = 'not-approved';
export const PUBLISH_ERROR_MSG = 'not-published';

let selection = {};
export const selectionCalls = [];
export const setSelection = (value) => { selection = value; };
export const resolveAssetSelection = (args) => {
  selectionCalls.push(args);
  return selection;
};
