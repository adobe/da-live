// Awareness-backed sync layer for the comments controller.
//
// Owns:
//   - broadcasting local `comments.version` so remote peers can refresh
//   - listening for remote `comments.version` changes and calling store.refresh
//   - reading the local user identity from awareness for comment authors
//
// REST is the source of truth for comment data; awareness is purely a
// "something changed" notification channel.

export function createAwarenessSync({ wsProvider, commentsStore: store }) {
  const awareness = wsProvider?.awareness;

  const broadcastChange = () => {
    try {
      awareness?.setLocalStateField('comments', { version: Date.now() });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[comments] broadcast failed', err);
    }
  };

  let onRemoteUpdate = null;
  if (awareness) {
    const lastSeenVersions = new Map();
    onRemoteUpdate = ({ added, updated, removed }) => {
      removed?.forEach((id) => lastSeenVersions.delete(id));
      const myId = awareness.clientID;
      const remoteChanged = [...added, ...updated]
        .filter((id) => id !== myId)
        .some((id) => {
          const v = awareness.getStates().get(id)?.comments?.version;
          if (!v || v === lastSeenVersions.get(id)) return false;
          lastSeenVersions.set(id, v);
          return true;
        });
      if (remoteChanged) store?.refresh();
    };
    awareness.on('update', onRemoteUpdate);
  }

  return {
    broadcastChange,

    getCurrentUser() {
      return awareness?.getLocalState()?.user ?? null;
    },

    onCurrentUserChange(fn) {
      if (!awareness) return () => {};
      let prevUserId = awareness.getLocalState()?.user?.id;
      const wrapped = () => {
        const nextUserId = awareness.getLocalState()?.user?.id;
        if (nextUserId === prevUserId) return;
        prevUserId = nextUserId;
        fn();
      };
      awareness.on('update', wrapped);
      return () => awareness.off('update', wrapped);
    },

    destroy() {
      if (onRemoteUpdate) {
        awareness?.off('update', onRemoteUpdate);
        onRemoteUpdate = null;
      }
    },
  };
}
