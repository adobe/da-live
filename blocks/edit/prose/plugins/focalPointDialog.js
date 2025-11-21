import '../../../shared/da-dialog/da-dialog.js';
import { getNx } from '../../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
await loadStyle('/blocks/edit/prose/plugins/focalPointDialog.css');

let currentDialog = null;
let faceApiLoaded = false;
let faceApiLoading = null;
let faceDetectorOptions = null;

const loadFaceApi = async () => {
  if (faceApiLoaded) return true;
  if (faceApiLoading) return faceApiLoading;

  faceApiLoading = (async () => {
    try {
      if (!window.faceapi) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/deps/face-api/face-api.min.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load face-api.js'));
          document.head.appendChild(script);
        });
      }

      await window.faceapi.nets.tinyFaceDetector.loadFromUri('/deps/face-api/');
      faceDetectorOptions = new window.faceapi.TinyFaceDetectorOptions();
      faceApiLoaded = true;
      return true;
    } catch (error) {
      return false;
    }
  })();

  return faceApiLoading;
};

const detectFaceCenter = async (img) => {
  try {
    const detection = await window.faceapi.detectSingleFace(img, faceDetectorOptions);
    if (!detection) return null;

    const { box } = detection;
    const imgWidth = img.naturalWidth || img.width;
    const imgHeight = img.naturalHeight || img.height;

    // Calculate center of detected face as percentage
    const centerX = ((box.x + box.width / 2) / imgWidth) * 100;
    const centerY = ((box.y + box.height / 2) / imgHeight) * 100;

    return {
      x: Math.max(0, Math.min(100, centerX)),
      y: Math.max(0, Math.min(100, centerY)),
    };
  } catch (error) {
    return null;
  }
};

function hasFocalPointData(attrs) {
  return (attrs.dataFocalX && attrs.dataFocalX !== '')
    || (attrs.dataFocalY && attrs.dataFocalY !== '');
}

function createCoordinateInput(label, value) {
  const labelEl = document.createElement('label');
  labelEl.textContent = `${label}: `;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = `${parseFloat(value).toFixed(2)}%`;
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
  // Verify the node at pos is still the same image
  const docNode = view.state.doc.nodeAt(pos);
  if (!docNode || docNode.type.name !== node.type.name || docNode.attrs.src !== node.attrs.src) {
    return;
  }

  const tr = view.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    dataFocalX: x?.toFixed(2) || null,
    dataFocalY: y?.toFixed(2) || null,
  });
  view.dispatch(tr);
}

// eslint-disable-next-line import/prefer-default-export
export async function openFocalPointDialog(view, pos, node) {
  if (currentDialog) {
    currentDialog.remove();
    currentDialog = null;
  }

  const parseCoord = (val) => (val ? parseFloat(val) : null);
  let originalFocalX = parseCoord(node.attrs.dataFocalX);
  let originalFocalY = parseCoord(node.attrs.dataFocalY);

  let currentX = originalFocalX ?? 50;
  let currentY = originalFocalY ?? 50;

  const shouldDetectFace = !hasFocalPointData(node.attrs);

  const dialog = document.createElement('da-dialog');
  dialog.title = 'Set Image Focal Point';
  dialog.className = 'focal-point-dialog';
  dialog.size = 'large';

  const content = document.createElement('div');
  content.className = 'focal-point-content';

  const imageContainer = document.createElement('div');
  imageContainer.className = 'focal-point-image-container';

  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';
  img.src = node.attrs.src;
  img.className = 'focal-point-image';
  img.draggable = false;

  let corsAvailable = true;

  // If CORS fails, reload without it
  img.addEventListener('error', () => {
    corsAvailable = false;
    img.crossOrigin = null;
    img.src = node.attrs.src;
  }, { once: true });

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
  dialog.appendChild(content);

  let isDragging = false;

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

  if (shouldDetectFace) {
    (async () => {
      try {
        await new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) resolve();
          else {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }
        });

        if (!corsAvailable) return;

        const loaded = await loadFaceApi();
        if (loaded) {
          const faceCenter = await detectFaceCenter(img);
          if (faceCenter && !isDragging) {
            currentX = faceCenter.x;
            currentY = faceCenter.y;
            updateIndicatorPosition(currentX, currentY);
            updateNodeFocalPoint(view, pos, node, currentX, currentY);
          }
        }
      } catch (e) {
        // ignore
      }
    })();
  }

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

  dialog.action = {
    label: 'Accept',
    style: 'accent',
    click: () => {
      originalFocalX = currentX;
      originalFocalY = currentY;
      cleanupEventListeners(handleMouseMove, handleMouseUp);
      dialog.close();
    },
  };

  dialog.addEventListener('close', () => {
    updateNodeFocalPoint(view, pos, node, originalFocalX, originalFocalY);
    cleanupEventListeners(handleMouseMove, handleMouseUp);
    currentDialog = null;
    dialog.remove();
  });

  const cancelBtn = document.createElement('sl-button');
  cancelBtn.className = 'primary outline';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.slot = 'footer-left';
  cancelBtn.addEventListener('click', () => {
    updateNodeFocalPoint(view, pos, node, originalFocalX, originalFocalY);
    dialog.close();
  });

  const clearBtn = document.createElement('sl-button');
  clearBtn.className = 'negative outline';
  clearBtn.textContent = 'Clear Focal Point';
  clearBtn.slot = 'footer-left';

  if (!hasFocalPointData(node.attrs)) {
    clearBtn.setAttribute('disabled', 'true');
  }

  clearBtn.addEventListener('click', () => {
    originalFocalX = null;
    originalFocalY = null;
    cleanupEventListeners(handleMouseMove, handleMouseUp);
    dialog.close();
  });

  dialog.appendChild(cancelBtn);
  dialog.appendChild(clearBtn);

  document.body.appendChild(dialog);
  currentDialog = dialog;

  // Wait for image to load and DOM layout before positioning indicator
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
