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
  const { __original: original = asset } = asset;
  return {
    ...original,
    name: asset.name || original.name || original['repo:name'] || original.asset_name,
    path: asset.path || original.path || original['repo:path']
      || (original.asset_name_path && `${original.asset_name_path}/${original.asset_name}`),
    mimetype: asset.mimetype || original.mimetype || original['dc:format'],
  };
}

export function createAssetDragHandlers({ container, isLive, getPreview = () => null }) {
  let draggedAssets;
  return {
    iframe_dragStart: ({ assets }) => { draggedAssets = assets; },
    iframe_dragMove: () => {},
    iframe_dragEnd: ({ assets = draggedAssets, mouse } = {}) => {
      draggedAssets = undefined;
      if (!isLive() || !Array.isArray(assets) || !assets.length
        || !assets.every((asset) => asset && typeof asset === 'object')
        || !Number.isFinite(mouse?.x) || !Number.isFinite(mouse?.y)) return false;
      const source = container.querySelector('iframe');
      if (!source?.isConnected) return false;
      const rect = source.getBoundingClientRect();
      const x = rect.left + mouse.x;
      const y = rect.top + mouse.y;
      const target = findTarget({ x, y });
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
      preview.port.postMessage({
        type: MESSAGE_TYPES.IMAGE_REPLACE,
        payload: { assets: normalized, x: x - bounds.left, y: y - bounds.top },
      });
      return true;
    },
  };
}
