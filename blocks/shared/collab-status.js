import { daFetch } from './utils.js';

function handleAwarenessUpdates(wsProvider, daTitle, win, path) {
  const users = new Set();

  wsProvider?.awareness.on('update', (delta) => {
    delta.added.forEach((u) => users.add(u));
    delta.updated.forEach((u) => users.add(u));
    delta.removed.forEach((u) => users.delete(u));

    // Don't show the current user
    users.delete(wsProvider.awareness.clientID);

    const awarenessStates = wsProvider.awareness.getStates();
    const userMap = new Map();
    [...users].forEach((u) => {
      const userInfo = awarenessStates.get(u)?.user;
      if (!userInfo?.id) {
        userMap.set(`anonymous-${u}`, 'Anonymous');
      } else if (userInfo.id !== wsProvider.awareness.getLocalState().user?.id) {
        userMap.set(userInfo.id, userInfo.name);
      }
    });
    daTitle.collabUsers = [...userMap.values()].sort();
  });

  wsProvider?.on('status', (st) => { daTitle.collabStatus = st.status; });

  wsProvider?.on('connection-close', async () => {
    const resp = await daFetch(path, { method: 'HEAD' });
    if (resp.status === 404) {
      const split = window.location.hash.slice(2).split('/');
      split.pop();
      // Navigate to the parent folder
      window.location.replace(`/#/${split.join('/')}`);
    }
  });
  win.addEventListener('online', () => { daTitle.collabStatus = 'online'; });
  win.addEventListener('offline', () => { daTitle.collabStatus = 'offline'; });
  const DISCONNECT_TIMEOUT = 10 * 60 * 1000;
  let disconnectTimeout = null;
  win.addEventListener('focus', () => {
    // cancel any pending disconnect
    if (disconnectTimeout) clearTimeout(disconnectTimeout);
    wsProvider.connect();
  });
  win.addEventListener('blur', () => {
    if (disconnectTimeout) clearTimeout(disconnectTimeout);
    disconnectTimeout = setTimeout(() => {
      wsProvider.disconnect();
    }, DISCONNECT_TIMEOUT);
  });
}

export function createAwarenessStatusWidget(wsProvider, win, path) {
  const daTitle = win.document.querySelector('da-title');
  handleAwarenessUpdates(wsProvider, daTitle, win, path);
  return daTitle;
}
