export function createChannel({ replay = false } = {}) {
  const listeners = new Set();
  let lastValue;
  let hasValue = false;
  return {
    emit(detail) {
      lastValue = detail;
      hasValue = true;
      listeners.forEach((fn) => fn(detail));
    },
    subscribe(fn) {
      listeners.add(fn);
      if (replay && hasValue && (replay === true || replay(lastValue))) fn(lastValue);
      return () => listeners.delete(fn);
    },
    get subscriberCount() {
      return listeners.size;
    },
  };
}
