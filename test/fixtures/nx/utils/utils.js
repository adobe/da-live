const _styles = new Map();
// The dev server appends params such as ?wds-import-map=0 to module URLs.
const styleKey = (href) => href?.split('?')[0];
export const loadStyle = async (href) => {
  if (_styles.has(styleKey(href))) return _styles.get(styleKey(href));
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('');
  return sheet;
};
// Tests can control the result of one stylesheet URL; call without a sheet to restore it.
loadStyle._set = (href, sheet) => {
  if (sheet) _styles.set(styleKey(href), sheet);
  else _styles.delete(styleKey(href));
};

export const loadScript = async () => {};

export const DA_ADMIN = 'https://admin.da.live';

export const DA_COLLAB = 'wss://collab.da.live';

let _hashState = {};
const _hashSubscribers = new Set();
export const hashChange = {
  subscribe(fn) {
    _hashSubscribers.add(fn);
    fn(_hashState);
    return () => _hashSubscribers.delete(fn);
  },
  _set(state) {
    _hashState = state;
    _hashSubscribers.forEach((fn) => fn(state));
  },
};
