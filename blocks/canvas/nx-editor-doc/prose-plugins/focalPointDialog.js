let currentDialog = null;

function hasFocalPointData(attrs) {
  return (attrs.dataFocalX && attrs.dataFocalX !== '')
    || (attrs.dataFocalY && attrs.dataFocalY !== '');
}

function createCoordinateInput(label, value) {
  const labelEl = document.createElement('label');
  labelEl.textContent = `${label}: `;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = `${parseFloat(String(value)).toFixed(2)}%`;
  input.className = 'focal-point-input';
  input.disabled = true;
  labelEl.appendChild(input);
  return { labelEl, input };
}

function cleanupEventListeners(handleMouseMove, handleMouseUp) {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

function updateNodeFocalPoint(view, pos, node, x, y) {
  const docNode = view.state.doc.nodeAt(pos);
  if (!docNode || docNode.type.name !== node.type.name || docNode.attrs.src !== node.attrs.src) {
    return;
  }

  const tr = view.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    dataFocalX: x != null && x !== '' ? Number(x).toFixed(2) : null,
    dataFocalY: y != null && y !== '' ? Number(y).toFixed(2) : null,
  });
  view.dispatch(tr);
}

const parseCoord = (val) => (val ? parseFloat(val) : null);

/**
 * @param {import('prosemirror-view').EditorView} view
 * @param {number} pos
 * @param {import('prosemirror-model').Node} node
 */
export function openFocalPointDialog(view, pos, node) {
  if (currentDialog) {
    currentDialog.remove();
    currentDialog = null;
  }

  const snapshotX = parseCoord(node.attrs.dataFocalX);
  const snapshotY = parseCoord(node.attrs.dataFocalY);

  let currentX = snapshotX ?? 50;
  let currentY = snapshotY ?? 50;

  const dialog = document.createElement('dialog');
  dialog.className = 'nx-focal-point-dialog';

  const title = document.createElement('h2');
  title.className = 'nx-focal-point-dialog__title';
  title.textContent = 'Set Image Focal Point';

  const content = document.createElement('div');
  content.className = 'focal-point-content';

  const imageContainer = document.createElement('div');
  imageContainer.className = 'focal-point-image-container';

  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';
  img.src = node.attrs.src;
  img.className = 'focal-point-image';
  img.draggable = false;

  const indicator = document.createElement('div');
  indicator.className = 'focal-point-indicator';

  const inner = document.createElement('div');
  inner.className = 'focal-point-inner';

  indicator.append(inner);

  imageContainer.appendChild(img);

  img.addEventListener('load', () => {
    imageContainer.appendChild(indicator);
  });

  const coordsContainer = document.createElement('div');
  coordsContainer.className = 'focal-point-coords';

  const { labelEl: xLabel, input: xInput } = createCoordinateInput('X', currentX);
  const { labelEl: yLabel, input: yInput } = createCoordinateInput('Y', currentY);

  coordsContainer.appendChild(xLabel);
  coordsContainer.appendChild(yLabel);

  content.appendChild(imageContainer);
  content.appendChild(coordsContainer);

  const footer = document.createElement('div');
  footer.className = 'nx-focal-point-dialog__footer';

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'nx-focal-point-dialog__btn nx-focal-point-dialog__btn--accent';
  acceptBtn.textContent = 'Accept';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'nx-focal-point-dialog__btn';
  cancelBtn.textContent = 'Cancel';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'nx-focal-point-dialog__btn nx-focal-point-dialog__btn--danger';
  clearBtn.textContent = 'Clear Focal Point';

  if (!hasFocalPointData(node.attrs)) {
    clearBtn.disabled = true;
  }

  footer.append(cancelBtn, clearBtn, acceptBtn);

  dialog.append(title, content, footer);

  let isDragging = false;
  /** @type {'pending' | 'accept' | 'cancel' | 'clear'} */
  let outcome = 'pending';

  const updateIndicatorPosition = (x, y) => {
    const imgRect = img.getBoundingClientRect();
    const containerRect = imageContainer.getBoundingClientRect();

    const imgLeft = imgRect.left - containerRect.left;
    const imgTop = imgRect.top - containerRect.top;

    const pixelX = imgLeft + ((imgRect.width * x) / 100);
    const pixelY = imgTop + ((imgRect.height * y) / 100);

    indicator.style.left = `${pixelX}px`;
    indicator.style.top = `${pixelY}px`;
    xInput.value = `${x.toFixed(2)}%`;
    yInput.value = `${y.toFixed(2)}%`;
  };

  const updatePositionFromEvent = (e) => {
    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    currentX = Math.max(0, Math.min(100, x));
    currentY = Math.max(0, Math.min(100, y));

    updateIndicatorPosition(currentX, currentY);
  };

  const handleMouseDown = (e) => {
    if (e.target === img || e.target === imageContainer) {
      isDragging = true;
      imageContainer.style.cursor = 'grabbing';
      e.preventDefault();
      updatePositionFromEvent(e);
      updateNodeFocalPoint(view, pos, node, currentX, currentY);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    updatePositionFromEvent(e);
  };

  const handleMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      imageContainer.style.cursor = '';
      updateNodeFocalPoint(view, pos, node, currentX, currentY);
    }
  };

  imageContainer.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  const finish = () => {
    cleanupEventListeners(handleMouseMove, handleMouseUp);
    currentDialog = null;
    dialog.remove();
    view.focus();
  };

  dialog.addEventListener('cancel', () => {
    outcome = 'cancel';
  });

  dialog.addEventListener('close', () => {
    if (outcome === 'cancel' || outcome === 'pending') {
      updateNodeFocalPoint(view, pos, node, snapshotX, snapshotY);
    } else if (outcome === 'accept') {
      updateNodeFocalPoint(view, pos, node, currentX, currentY);
    }
    finish();
  });

  acceptBtn.addEventListener('click', () => {
    outcome = 'accept';
    dialog.close();
  });

  cancelBtn.addEventListener('click', () => {
    outcome = 'cancel';
    dialog.close();
  });

  clearBtn.addEventListener('click', () => {
    outcome = 'clear';
    updateNodeFocalPoint(view, pos, node, null, null);
    dialog.close();
  });

  document.body.appendChild(dialog);
  currentDialog = dialog;
  dialog.showModal();

  const positionIndicator = () => {
    const update = () => {
      requestAnimationFrame(() => {
        updateIndicatorPosition(currentX, currentY);
      });
    };

    if (img.complete && img.naturalWidth > 0) {
      update();
    } else {
      img.addEventListener('load', update);
      img.addEventListener('error', update);
    }
  };

  positionIndicator();
}
