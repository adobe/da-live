import { COLLAB_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import { WebsocketProvider, Y } from 'da-y-wrapper';
import { drawOverlays, generateColor } from './overlays.js';
import { jSheetToY } from './convert.js';
import { getData } from '../utils/index.js';

// for config sheets, we don't join collab, instead use a local ydoc
export async function attachLocalYDoc(el) {
  const data = await getData(el.details.sourceUrl);
  const ydoc = new Y.Doc();

  // wait for ydoc to start listening for changes before setting data
  setTimeout(() => {
    ydoc.transact(() => {
      jSheetToY(data, ydoc);
    });
  }, 0);
  
  const ysheets = ydoc.getArray('sheets');
  const yUndoManager = new Y.UndoManager(ysheets);

  return { ydoc, yUndoManager };
}

export default function joinCollab(el) {
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

  // Set up user awareness with name and color
  if (window.adobeIMS?.isSignedInUser()) {
    window.adobeIMS.getProfile().then((profile) => {
      wsProvider.awareness.setLocalStateField('user', {
        color: generateColor(profile.email || profile.userId),
        name: profile.displayName,
        id: profile.userId,
      });
    });
  } else {
    wsProvider.awareness.setLocalStateField('user', {
      color: generateColor(`${wsProvider.awareness.clientID}`),
      name: 'Anonymous',
      id: `anonymous-${wsProvider.awareness.clientID}}`,
    });
  }

  wsProvider.awareness.on('change', () => {
    drawOverlays(wsProvider);
  });

  const yUndoManager = new Y.UndoManager(ysheets, {
    trackedOrigins: new Set([wsProvider.awareness.clientID]),
  });

  return { ydoc, wsProvider, yUndoManager };
}