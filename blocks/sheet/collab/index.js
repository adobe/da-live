import { COLLAB_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import { WebsocketProvider, Y } from 'da-y-wrapper';

export default async function joinCollab(el) {
  const path = el.details.sourceUrl;

  const ydoc = new Y.Doc();
  const ysheets = ydoc.getArray('sheets');

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = { protocols: ['yjs'] };

  if (window.adobeIMS?.isSignedInUser()) {
    const { token } = window.adobeIMS.getAccessToken();
    // add token to the sec-websocket-protocol header
    opts.protocols.push(token);
  }

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, opts);

  // Increase the max backoff time to 30 seconds. If connection error occurs,
  // the socket provider will try to reconnect quickly at the beginning
  // (exponential backoff starting with 100ms) and then every 30s.
  wsProvider.maxBackoffTime = 30000;

  const yUndoManager = new Y.UndoManager(ysheets, {
    trackedOrigins: new Set(['foo']), // todo client id from awareness
  });

  return { ydoc, wsProvider, yUndoManager };
}