export function subscribeCollabUserList(wsProvider, onList) {
  const users = new Set();
  const dispatch = () => {
    const self = wsProvider.awareness.clientID;
    const awarenessStates = wsProvider.awareness.getStates();
    const userMap = new Map();
    [...users].forEach((u, i) => {
      if (u === self) return;
      const userInfo = awarenessStates.get(u)?.user;
      if (!userInfo?.name) {
        userMap.set(`anonymous-${u}`, 'Anonymous');
      } else {
        userMap.set(`${userInfo.id}-${i}`, userInfo.name);
      }
    });
    onList([...userMap.values()].sort());
  };
  const onUpdate = (delta) => {
    delta.added.forEach((u) => users.add(u));
    delta.updated.forEach((u) => users.add(u));
    delta.removed.forEach((u) => users.delete(u));
    dispatch();
  };
  wsProvider.awareness.on('update', onUpdate);
  dispatch();
  return () => {
    wsProvider.awareness.off('update', onUpdate);
  };
}
