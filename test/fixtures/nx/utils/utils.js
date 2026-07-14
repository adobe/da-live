export const loadStyle = async () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('');
  return sheet;
};

export const DA_ADMIN = 'https://admin.da.live';

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
