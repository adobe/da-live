import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';

function findTarget({ x, y }) {
  let target = document.elementFromPoint(x, y);
  while (target?.shadowRoot) {
    const child = target.shadowRoot.elementFromPoint(x, y);
    if (!child || child === target) break;
    target = child;
  }
  return target;
}

function normalizeAsset(asset) {
  const { __original: originalAsset } = asset;
  const original = originalAsset || asset;
  return {
    ...original,
    name: asset.name || original.name || original['repo:name'] || original.asset_name,
    path: asset.path || original.path || original['repo:path']
      || (original.asset_name_path && `${original.asset_name_path}/${original.asset_name}`),
    mimetype: asset.mimetype || original.mimetype || original['dc:format'],
  };
}

export function createAssetDragHandlers({ container, isLive, getPreview = () => null, style }) {
  let draggedAssets;
  let layer;
  let ghost;
  let shield;
  let pointer;
  let listeners;
  let hoveredPreview;
  let completed = false;

  const sourcePoint = (mouse) => {
    const source = container.querySelector('iframe');
    if (!source?.isConnected || !Number.isFinite(mouse?.x)
      || !Number.isFinite(mouse?.y)) return null;
    const rect = source.getBoundingClientRect();
    return { x: rect.left + mouse.x, y: rect.top + mouse.y };
  };

  const clearPreview = () => {
    // Empty assets make feedback a no-op in older preview receivers.
    hoveredPreview?.port.postMessage({
      type: MESSAGE_TYPES.IMAGE_REPLACE,
      payload: { assets: [], phase: 'leave' },
    });
    hoveredPreview = undefined;
  };

  const updatePreview = () => {
    if (!layer) return;
    const preview = getPreview();
    const iframe = preview?.port && preview.iframe;
    const bounds = iframe?.isConnected && iframe.getBoundingClientRect();
    shield.hidden = !bounds || !bounds.width || !bounds.height;
    if (shield.hidden) {
      clearPreview();
      return;
    }
    Object.assign(shield.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
    if (!pointer || pointer.x < bounds.left || pointer.x >= bounds.left + bounds.width
      || pointer.y < bounds.top || pointer.y >= bounds.top + bounds.height) {
      clearPreview();
      return;
    }
    if (hoveredPreview?.port !== preview.port || hoveredPreview?.iframe !== iframe) clearPreview();
    hoveredPreview = preview;
    preview.port.postMessage({
      type: MESSAGE_TYPES.IMAGE_REPLACE,
      payload: { assets: [], phase: 'hover', x: pointer.x - bounds.left, y: pointer.y - bounds.top },
    });
  };

  const destroy = () => {
    clearPreview();
    completed = true;
    draggedAssets = undefined;
    pointer = undefined;
    layer?.remove();
    layer = undefined;
    ghost = undefined;
    shield = undefined;
    listeners?.abort();
    listeners = undefined;
  };

  const move = ({ mouse, point } = {}) => {
    if (!layer) return;
    if (!isLive()) {
      destroy();
      return;
    }
    pointer = point || sourcePoint(mouse) || pointer;
    if (pointer) ghost.style.transform = `translate(${pointer.x + 12}px, ${pointer.y + 12}px)`;
    updatePreview();
  };

  const finish = ({ assets = draggedAssets, mouse, point } = {}) => {
    if (completed) return false;
    const coords = point || sourcePoint(mouse);
    destroy();
    if (!isLive() || !coords || !Array.isArray(assets) || !assets.length
      || !assets.every((asset) => asset && typeof asset === 'object')) return false;
    const { x, y } = coords;
    const target = findTarget(coords);
    const normalized = assets.map(normalizeAsset);
    if (target?.closest('.ProseMirror')?.isContentEditable) {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('collectionviewdata', JSON.stringify(normalized));
      return !target.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        composed: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer,
      }));
    }
    const preview = getPreview();
    if (target !== preview?.iframe || !preview?.iframe?.isConnected || !preview.port) {
      return false;
    }
    const bounds = preview.iframe.getBoundingClientRect();
    // SDK metadata may contain callbacks; use the same JSON boundary as document drops.
    const serializableAssets = JSON.parse(JSON.stringify(normalized));
    preview.port.postMessage({
      type: MESSAGE_TYPES.IMAGE_REPLACE,
      payload: { assets: serializableAssets, x: x - bounds.left, y: y - bounds.top },
    });
    return true;
  };

  const start = ({ assets, dataUrl, mouse } = {}) => {
    destroy();
    if (!isLive() || !Array.isArray(assets) || !assets.length
      || !assets.every((asset) => asset && typeof asset === 'object')) return;
    completed = false;
    draggedAssets = assets;
    listeners = new AbortController();
    const { signal } = listeners;
    layer = document.createElement('div');
    layer.className = 'assets-rail-drag-layer';
    layer.setAttribute('aria-hidden', 'true');
    const root = layer.attachShadow({ mode: 'open' });
    if (style) root.adoptedStyleSheets = [style];
    ghost = document.createElement('div');
    ghost.className = 'assets-rail-drag-preview';
    if (typeof dataUrl === 'string' && /^(data:image\/|blob:)/.test(dataUrl)) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '';
      ghost.append(img);
    }
    shield = document.createElement('div');
    shield.className = 'assets-rail-preview-shield';
    shield.hidden = true;
    shield.addEventListener('pointermove', (event) => {
      move({ point: { x: event.clientX, y: event.clientY } });
    });
    shield.addEventListener('pointerleave', clearPreview);
    shield.addEventListener('dragleave', clearPreview);
    const release = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      finish({ point: { x: event.clientX, y: event.clientY } });
    };
    shield.addEventListener('pointerup', release);
    shield.addEventListener('mouseup', release);
    shield.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types?.includes('collectionviewdata')) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      move({ point: { x: event.clientX, y: event.clientY } });
    });
    shield.addEventListener('drop', (event) => {
      if (!event.dataTransfer?.types?.includes('collectionviewdata')) return;
      event.preventDefault();
      event.stopPropagation();
      finish({ point: { x: event.clientX, y: event.clientY } });
    });
    root.append(shield, ghost);
    document.body.append(layer);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') destroy();
    }, { capture: true, signal });
    document.addEventListener('scroll', updatePreview, { capture: true, signal });
    window.addEventListener('blur', destroy, { signal });
    move({ mouse });
  };

  return {
    iframe_dragStart: start,
    iframe_dragMove: move,
    iframe_dragEnd: finish,
    destroy,
  };
}
