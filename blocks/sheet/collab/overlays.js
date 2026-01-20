export function generateColor(name, hRange = [0, 360], sRange = [60, 80], lRange = [40, 60]) {
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

function setupOverlayListeners(wrapper, wsProvider) {
  if (!wsProvider?.awareness) return;

  // Set up listener for tab changes to redraw overlays
  const daSheetTabs = wrapper.querySelector('da-sheet-tabs');
  if (daSheetTabs) {
    daSheetTabs.removeEventListener('sheet-changed', daSheetTabs._sheetChangedHandler);
    daSheetTabs._sheetChangedHandler = () => {
      drawOverlays(wsProvider);
    };
    daSheetTabs.addEventListener('sheet-changed', daSheetTabs._sheetChangedHandler);
  }

  // Set up listener for scroll events to redraw overlays
  const jexcelContent = wrapper.querySelector('.jexcel_content');
  if (jexcelContent) {
    jexcelContent.removeEventListener('scroll', jexcelContent._scrollHandler);
    jexcelContent._scrollHandler = () => {
      drawOverlays(wsProvider);
    };
    jexcelContent.addEventListener('scroll', jexcelContent._scrollHandler, { passive: true });
  }
}

export function drawOverlays(wsProvider) {
  if (!wsProvider?.awareness) return;

  const tabs = document.querySelector('da-sheet-tabs');
  if (!tabs || !tabs.jexcel) return;

  const wrapper = document.querySelector('.da-sheet-wrapper');
  if (!wrapper) return;

  // Set up listeners
  setupOverlayListeners(wrapper, wsProvider);

  // Get states and clientID from wsProvider
  const states = wsProvider.awareness.getStates();
  const ownClientId = wsProvider.awareness.clientID;

  // Get local user's current selection
  const localState = states.get(ownClientId);
  const localSelection = localState?.position?.selection;
  const localSheetIdx = localState?.position?.sheetIdx;

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

    // Hide overlay if scrolled out of view
    if (left < 0 || top < 0) {
      overlayDiv.style.display = 'none';
      return;
    }

    // Check if remote cell is within local user's selection
    const isWithinLocalSelection = localSelection && 
                                    localSheetIdx === sheetIdx &&
                                    x1 >= localSelection.x1 && x1 <= localSelection.x2 &&
                                    y1 >= localSelection.y1 && y1 <= localSelection.y2;

    // Check if local user has selected the row just before this marker
    const shouldPositionBelow = localSelection && 
                                 localSheetIdx === sheetIdx &&
                                 localSelection.y2 === y1 - 1 &&
                                 !isWithinLocalSelection;

    // Show and position the overlay
    overlayDiv.style.display = '';
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

    // Hide name label if remote cell is within local selection
    if (isWithinLocalSelection) {
      nameLabel.style.display = 'none';
    } else {
      nameLabel.style.display = '';
      
      // Toggle position-below class based on local selection
      if (shouldPositionBelow) {
        nameLabel.classList.add('position-below');
      } else {
        nameLabel.classList.remove('position-below');
      }
    }

    nameLabel.textContent = user?.name || 'Anonymous';
    nameLabel.style.backgroundColor = user?.color || 'red';
  });
}
