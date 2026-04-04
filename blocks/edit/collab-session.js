import { createConnection } from './collab-connection.js';

const STALE_MSG = 'Stale collab session';

const state = {
  sourceUrl: null,
  promise: null,
  provider: null,
};

/**
 * Drop the active collab session (e.g. left edit view). In-flight connects
 * clean up when they resolve and see a mismatched URL.
 */
export function invalidateEditCollabSession(reason = 'Client navigation') {
  if (state.provider) {
    state.provider.disconnect({ data: reason });
  }
  const oldPromise = state.promise;
  state.sourceUrl = null;
  state.promise = null;
  state.provider = null;
  if (oldPromise) {
    void oldPromise.catch(() => {});
  }
}

/**
 * Returns a promise for { wsProvider, ydoc } for this source URL, reusing an
 * in-flight or settled connection when the URL matches. Replaces the session
 * when the URL changes.
 */
export function getOrStartEditCollabConnection(sourceUrl) {
  if (state.sourceUrl === sourceUrl && state.promise) {
    return state.promise;
  }

  if (state.provider) {
    state.provider.disconnect({ data: 'Client navigation' });
    state.provider = null;
  }

  const oldPromise = state.promise;
  if (oldPromise) {
    void oldPromise.catch(() => {});
  }

  const myUrl = sourceUrl;
  state.sourceUrl = myUrl;
  state.promise = (async () => {
    const result = await createConnection(myUrl);
    if (state.sourceUrl !== myUrl) {
      result.wsProvider.disconnect({ data: 'Stale connection' });
      throw new Error(STALE_MSG);
    }
    state.provider = result.wsProvider;
    return result;
  })();

  return state.promise;
}
