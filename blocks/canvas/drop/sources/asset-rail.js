import { fromAssets } from '../payload.js';
import { startSession } from '../session.js';
import { notifyDropResult } from '../pipeline.js';
import { getExtensionsBridge } from '../../editor-utils/extensions-bridge.js';

function createGhost(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^(data:image\/|blob:)/.test(dataUrl)) return undefined;
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = '';
  Object.assign(img.style, {
    width: '48px',
    height: '48px',
    objectFit: 'cover',
    borderRadius: 'var(--s2-corner-radius-75, 4px)',
    transform: 'translate(-10000px, -10000px)',
  });
  return img;
}

/**
 * AEM Asset Selector drag callbacks (`acvConfig.dragOptions.iframe: true`). The rail is
 * host UI, not an extension: assets arrive through these callbacks (the selector's native
 * drag data is unreadable in the host) and the drop goes through the shared session.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container the element the selector renders its iframe into
 * @param {{ org, site }} opts.context
 * @param {() => boolean} opts.isLive
 */
export function createAssetRailSource({ container, context, isLive }) {
  let session;

  // `mouse` is relative to the selector iframe
  const hostPoint = (mouse) => {
    const frame = container.querySelector('iframe');
    if (!frame?.isConnected || !Number.isFinite(mouse?.x)
      || !Number.isFinite(mouse?.y)) return null;
    const rect = frame.getBoundingClientRect();
    return { x: rect.left + mouse.x, y: rect.top + mouse.y };
  };

  const destroy = () => session?.cancel();

  return {
    iframe_dragStart: ({ assets, dataUrl, mouse } = {}) => {
      destroy();
      const payload = isLive() && fromAssets(assets);
      if (!payload) return;
      const started = startSession({
        payload,
        getView: () => (isLive() ? getExtensionsBridge().view : null),
        getContext: () => context,
        ghost: createGhost(dataUrl),
        onEnd: (result) => {
          if (session === started) session = undefined;
          notifyDropResult(result);
        },
      });
      session = started ?? undefined;
      session?.move(hostPoint(mouse));
    },
    iframe_dragMove: ({ mouse } = {}) => session?.move(hostPoint(mouse)),
    iframe_dragEnd: ({ mouse } = {}) => { session?.finish(hostPoint(mouse)); },
    destroy,
  };
}
