// A 4412 close means the server replaced the room's authoritative Source.
// The old Y.Doc must never be allowed to reconnect, even through a previously
// scheduled retry or a window focus handler.
const fencedProviders = new WeakSet();
const viewDisposers = new WeakMap();

export function isFencedProvider(provider) {
  return fencedProviders.has(provider);
}

export function registerFencedView(provider, dispose) {
  viewDisposers.set(provider, dispose);
}

const reloadPage = () => window.location.reload();

export function handleFencedRoomClose(event, provider, ydoc, reload = reloadPage) {
  if (event?.code !== 4412) return false;
  if (isFencedProvider(provider)) return true;
  fencedProviders.add(provider);
  provider.shouldConnect = false;
  try {
    viewDisposers.get(provider)?.();
  } finally {
    viewDisposers.delete(provider);
    try {
      provider.destroy();
    } finally {
      try {
        ydoc.destroy();
      } finally {
        reload();
      }
    }
  }
  return true;
}
