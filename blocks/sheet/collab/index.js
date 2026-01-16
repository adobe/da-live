import { COLLAB_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import { WebsocketProvider, Y } from 'da-y-wrapper';

function generateColor(name, hRange = [0, 360], sRange = [60, 80], lRange = [40, 60]) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const normalizeHash = (min, max) => Math.floor((hash % (max - min)) + min);
  const h = normalizeHash(hRange[0], hRange[1]);
  const s = normalizeHash(sRange[0], sRange[1]);
  const l = normalizeHash(lRange[0], lRange[1]) / 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function drawOverlays(states, ownClientId) {
  const tabs = document.querySelector('da-sheet-tabs');
  if (!tabs || !tabs.jexcel) return;

  const wrapper = document.querySelector('.da-sheet-wrapper');
  if (!wrapper) return;

  states.forEach((state, clientId) => {
    if (clientId === ownClientId) {
      return;
    }

    const position = state?.position;
    const user = state?.user;

    if (!position || !position.selection) {
      // Remove overlay if no position
      const existingOverlay = document.getElementById(`collab-overlay-${clientId}`);
      if (existingOverlay) existingOverlay.remove();
      return;
    }

    const { sheetIdx, selection } = position;
    const { x1, y1 } = selection;
    
    const sheet = tabs.jexcel[sheetIdx];
    if (!sheet || !sheet.records) return;

    // Get the cell at x1, y1
    const cell = sheet.records[y1]?.[x1];
    if (!cell) return;

    // Calculate position relative to da-sheet-wrapper container
    const cellRect = cell.getBoundingClientRect();
    const containerRect = wrapper.getBoundingClientRect();
    
    const left = cellRect.left - containerRect.left;
    const top = cellRect.top - containerRect.top;
    const width = cellRect.width;
    const height = cellRect.height;

    // Create or update the overlay div
    let overlayDiv = document.getElementById(`collab-overlay-${clientId}`);
    if (!overlayDiv) {
      overlayDiv = document.createElement('div');
      overlayDiv.id = `collab-overlay-${clientId}`;
      wrapper.appendChild(overlayDiv);
    }

    // Position and style the overlay (dynamic values only)
    overlayDiv.style.left = `${left}px`;
    overlayDiv.style.top = `${top}px`;
    overlayDiv.style.width = `${width}px`;
    overlayDiv.style.height = `${height}px`;
    overlayDiv.style.outline = `2px solid ${user?.color || 'red'}`;

    // Create or update the name label
    let nameLabel = overlayDiv.querySelector('.collab-name-label');
    if (!nameLabel) {
      nameLabel = document.createElement('div');
      nameLabel.className = 'collab-name-label';
      overlayDiv.appendChild(nameLabel);
    }

    nameLabel.textContent = user?.name || 'Anonymous';
    nameLabel.style.backgroundColor = user?.color || 'red';
  });
}

function awarenessListener(states, ownClientId) {
  drawOverlays(states, ownClientId);
}

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
    awarenessListener(wsProvider.awareness.getStates(), wsProvider.awareness.clientID);
  });

  const yUndoManager = new Y.UndoManager(ysheets, {
    trackedOrigins: new Set([wsProvider.awareness.clientID]),
  });

  return { ydoc, wsProvider, yUndoManager };
}