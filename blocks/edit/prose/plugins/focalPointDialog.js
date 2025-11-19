import '../../../shared/da-dialog/da-dialog.js';

let currentDialog = null;
let stylesLoaded = false;
let faceApiLoaded = false;
let faceApiLoading = null;

const DIALOG_RENDER_DELAY = 50;

// Content is slotted and lives in light DOM, so styles must be in main document
const loadDialogStyles = () => {
  if (!stylesLoaded && !document.getElementById('focal-point-dialog-styles')) {
    const link = document.createElement('link');
    link.id = 'focal-point-dialog-styles';
    link.rel = 'stylesheet';
    link.href = '/blocks/edit/prose/plugins/focalPointDialog.css';
    document.head.appendChild(link);
    stylesLoaded = true;
  }
};

const loadFaceApi = async () => {
  // Return early if already loaded
  if (faceApiLoaded) {
    return true;
  }

  // If loading is in progress, wait for it
  if (faceApiLoading) {
    return faceApiLoading;
  }

  // Start loading
  faceApiLoading = (async () => {
    try {
      // Load face-api.js library
      if (!window.faceapi) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/deps/face-api/face-api.min.js';
          script.onload = () => {
            resolve();
          };
          script.onerror = () => {
            reject(new Error('Failed to load face-api.js'));
          };
          document.head.appendChild(script);
        });
      }

      // Load tinyFaceDetector model
      await window.faceapi.nets.tinyFaceDetector.loadFromUri('/deps/face-api/');

      faceApiLoaded = true;
      return true;
    } catch (error) {
      // Silent failure - fall back to manual positioning
      return false;
    }
  })();

  return faceApiLoading;
};

const detectFaceCenter = async (img) => {
  try {
    const detection = await window.faceapi.detectSingleFace(
      img,
      new window.faceapi.TinyFaceDetectorOptions(),
    );

    if (!detection) {
      return null;
    }

    const { box } = detection;
    const imgWidth = img.naturalWidth || img.width;
    const imgHeight = img.naturalHeight || img.height;

    // Calculate center of detected face as percentage
    const centerX = ((box.x + box.width / 2) / imgWidth) * 100;
    const centerY = ((box.y + box.height / 2) / imgHeight) * 100;

    const result = {
      x: Math.max(0, Math.min(100, centerX)),
      y: Math.max(0, Math.min(100, centerY)),
    };
    return result;
  } catch (error) {
    // Silent failure - return null to fall back to default
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
  input.readOnly = true;
  labelEl.appendChild(input);
  return { labelEl, input };
}

function cleanupEventListeners(handleMouseMove, handleMouseUp) {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

function updateNodeFocalPoint(view, pos, node, x, y) {
  const tr = view.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    dataFocalX: x?.toFixed(2) || null,
    dataFocalY: y?.toFixed(2) || null,
  });
  view.dispatch(tr);
}

// eslint-disable-next-line import/prefer-default-export
export function openFocalPointDialog(view, pos, node) {
  loadDialogStyles();

  if (currentDialog) {
    currentDialog.remove();
    currentDialog = null;
  }

  const focalX = node.attrs.dataFocalX || '50.00';
  const focalY = node.attrs.dataFocalY || '50.00';

  // Detect face and set focal point if no existing focal point data
  const shouldDetectFace = !hasFocalPointData(node.attrs);
  let faceDetectionPromise = null;

  const dialog = document.createElement('da-dialog');
  dialog.title = 'Set Image Focal Point';
  dialog.className = 'focal-point-dialog';

  const content = document.createElement('div');
  content.className = 'focal-point-content';

  const imageContainer = document.createElement('div');
  imageContainer.className = 'focal-point-image-container';

  const img = document.createElement('img');
  img.src = node.attrs.src;
  img.className = 'focal-point-image';
  img.draggable = false;

  // Promise that resolves when image is loaded
  const imageLoadedPromise = new Promise((resolve) => {
    if (img.complete) {
      resolve();
    } else {
      img.addEventListener('load', () => resolve());
      img.addEventListener('error', () => resolve()); // Resolve anyway to not block UI
    }
  });

  // Set up face detection if needed
  if (shouldDetectFace) {
    faceDetectionPromise = (async () => {
      try {
        const loaded = await loadFaceApi();

        if (loaded) {
          // Check if image is same-origin to avoid CORS issues
          const imageSrc = node.attrs.src;
          const isSameOrigin = (() => {
            try {
              const imgUrl = new URL(imageSrc, window.location.href);
              return imgUrl.origin === window.location.origin;
            } catch {
              return false;
            }
          })();

          if (!isSameOrigin) {
            return null;
          }

          const faceCenter = await detectFaceCenter(img);
          return faceCenter;
        }
      } catch (error) {
        // Silent failure
      }
      return null;
    })();
  }

  const indicator = document.createElement('div');
  indicator.className = 'focal-point-indicator';

  imageContainer.appendChild(img);
  imageContainer.appendChild(indicator);

  const coordsContainer = document.createElement('div');
  coordsContainer.className = 'focal-point-coords';

  const { labelEl: xLabel, input: xInput } = createCoordinateInput('X', focalX);
  const { labelEl: yLabel, input: yInput } = createCoordinateInput('Y', focalY);

  coordsContainer.appendChild(xLabel);
  coordsContainer.appendChild(yLabel);

  content.appendChild(imageContainer);
  content.appendChild(coordsContainer);
  dialog.appendChild(content);

  let isDragging = false;
  let currentX = parseFloat(focalX);
  let currentY = parseFloat(focalY);

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
      imageContainer.style.cursor = 'crosshair';
      e.preventDefault();
      updatePositionFromEvent(e);
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
    }
  };

  imageContainer.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  const applyAction = {
    label: 'Apply',
    style: 'accent',
    click: () => {
      updateNodeFocalPoint(view, pos, node, currentX, currentY);
      cleanupEventListeners(handleMouseMove, handleMouseUp);
      dialog.close();
    },
  };

  dialog.action = applyAction;

  dialog.addEventListener('close', () => {
    cleanupEventListeners(handleMouseMove, handleMouseUp);
    currentDialog = null;
    dialog.remove();
  });

  const cancelBtn = document.createElement('sl-button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.close());

  const clearBtn = document.createElement('sl-button');
  clearBtn.textContent = 'Clear Focal Point';

  // Disable Clear button if there's no focal point data currently set
  if (!hasFocalPointData(node.attrs)) {
    clearBtn.setAttribute('disabled', 'true');
  }

  clearBtn.addEventListener('click', () => {
    updateNodeFocalPoint(view, pos, node, null, null);
    cleanupEventListeners(handleMouseMove, handleMouseUp);
    dialog.close();
  });

  // Customize dialog after it renders in shadow DOM
  setTimeout(() => {
    if (dialog.shadowRoot) {
      const widthStyle = document.createElement('style');
      widthStyle.textContent = `
        .da-dialog-inner {
          width: 700px !important;
          max-width: 90vw !important;
        }
        .da-dialog-footer {
          display: flex !important;
          justify-content: space-between !important;
          gap: 12px !important;
        }
        .da-dialog-footer-left {
          display: flex;
          gap: 8px;
        }
      `;
      dialog.shadowRoot.appendChild(widthStyle);

      const footer = dialog.shadowRoot.querySelector('.da-dialog-footer');
      if (footer) {
        const leftButtons = document.createElement('div');
        leftButtons.className = 'da-dialog-footer-left';
        leftButtons.appendChild(cancelBtn);
        leftButtons.appendChild(clearBtn);

        footer.insertBefore(leftButtons, footer.firstChild);
      }
    }
  }, DIALOG_RENDER_DELAY);

  document.body.appendChild(dialog);
  currentDialog = dialog;

  // Wait for image to load before positioning indicator
  imageLoadedPromise.then(() => {
    updateIndicatorPosition(currentX, currentY);
  });

  // Apply face detection result if it's in progress
  if (faceDetectionPromise) {
    faceDetectionPromise.then((faceCenter) => {
      if (faceCenter && !isDragging) {
        currentX = faceCenter.x;
        currentY = faceCenter.y;
        updateIndicatorPosition(currentX, currentY);
      }
    }).catch(() => {
      // Silent failure
    });
  }
}
