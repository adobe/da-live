import { WebsocketProvider, Y } from 'da-y-wrapper';

import { COLLAB_ORIGIN, DA_ORIGIN } from '../shared/constants.js';
import { getAuthToken } from '../shared/utils.js';

export async function createConnection(path) {
  const ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = {
    protocols: ['yjs'],
    connect: true,
  };

  const token = await getAuthToken();
  if (token) {
    opts.protocols.push(token);
  }

  const provider = new WebsocketProvider(server, roomName, ydoc, opts);
  provider.maxBackoffTime = 30000;

  return { wsProvider: provider, ydoc };
}
