export const loadStyle = async () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('');
  return sheet;
};

export const DA_ADMIN = 'https://admin.da.live';

// Replay-on-subscribe pub/sub, mirroring the real nx `hashChange` bus.
export const hashChange = (() => {
  const listeners = new Set();
  let current;
  return {
    emit(state) {
      current = state;
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      if (current) fn(current);
      return () => listeners.delete(fn);
    },
  };
})();
