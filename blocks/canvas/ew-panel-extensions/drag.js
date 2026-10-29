import { TextSelection, Fragment } from 'da-y-wrapper';
import { canvasBus } from '../utils/canvas-bus.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';
import { insertDroppedHtml } from '../editor-utils/html-drop.js';
import { handleHtmlDrop } from '../ew-editor-wysiwyg/utils/html-drop.js';
import { SUPPORTED_IMAGE_TYPES } from '../../shared/constants.js';
import { getNx2, getNx2Api } from '../../../scripts/utils.js';
import { refuseOversizedImage, MAX_IMAGE_BYTES } from '../utils/image-upload.js';

function validPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const { data = {}, files = [] } = payload;
  return data && typeof data === 'object' && !Array.isArray(data)
    && Object.entries(data).every(([type, value]) => ['text/html', 'text/plain'].includes(type)
      && typeof value === 'string' && value.length <= 1_000_000)
    && Array.isArray(files) && files.length <= 10
    && files.every((file) => file instanceof File && SUPPORTED_IMAGE_TYPES.includes(file.type)
      && file.size <= MAX_IMAGE_BYTES && file.name && file.name.length <= 255
      && !/[\\/\0]/.test(file.name) && !['.', '..'].includes(file.name))
    && files.reduce((total, file) => total + file.size, 0) <= MAX_IMAGE_BYTES
    && (files.length > 0 || data['text/html']?.trim() || data['text/plain']?.trim());
}

function containsPoint(element, { x, y }) {
  if (!element?.isConnected) return false;
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function createDragController({ iframe, getView, context, notify = () => {} }) {
  let active;
  let preview;
  let indicator;
  const pending = new Map();
  const unsubscribe = canvasBus.wysiwygPortReady.subscribe((value) => { preview = value; });
  const postPreview = (port, message) => {
    try {
      port?.postMessage(message);
      return true;
    } catch { return false; }
  };
  const leave = () => {
    indicator?.remove();
    indicator = undefined;
    postPreview(preview?.port, { type: MESSAGE_TYPES.DROP_TARGET, payload: { phase: 'leave' } });
  };
  const cancel = () => {
    if (active) {
      const drag = active;
      active.cancelled = true;
      clearTimeout(active.timer);
      active.listeners.abort();
      active.layer.remove();
      active = undefined;
      notify({ dragId: drag.id, result: drag.result || { ok: false, error: 'cancelled' } });
    }
    leave();
    pending.forEach((finish) => finish(null));
  };
  const live = (drag) => active === drag && !drag.cancelled && iframe.isConnected
    && getView() === drag.view && drag.view.editable && !drag.view.isDestroyed;
  const coordsFor = (point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const rect = iframe.getBoundingClientRect();
    if (!rect.width || !rect.height || !iframe.clientWidth || !iframe.clientHeight) return null;
    const scaleX = rect.width / iframe.offsetWidth;
    const scaleY = rect.height / iframe.offsetHeight;
    return {
      x: rect.left + (iframe.clientLeft + point.x) * scaleX,
      y: rect.top + (iframe.clientTop + point.y) * scaleY,
    };
  };
  const docTarget = (view, coords) => {
    if (!containsPoint(view.dom, coords)) return null;
    if (active) active.layer.style.pointerEvents = 'none';
    const element = view.root.elementFromPoint(coords.x, coords.y);
    const position = element && view.dom.contains(element)
      ? view.posAtCoords({ left: coords.x, top: coords.y })?.pos ?? null : null;
    if (active) active.layer.style.pointerEvents = 'auto';
    return position;
  };
  const previewPoint = (coords) => {
    if (!preview?.port || !containsPoint(preview.iframe, coords)) return null;
    const rect = preview.iframe.getBoundingClientRect();
    return {
      x: ((coords.x - rect.left) * preview.iframe.offsetWidth) / rect.width
        - preview.iframe.clientLeft,
      y: ((coords.y - rect.top) * preview.iframe.offsetHeight) / rect.height
        - preview.iframe.clientTop,
    };
  };
  const queryPreview = (coords, drag) => new Promise((resolve) => {
    const point = previewPoint(coords);
    if (!point) {
      resolve(null);
      return;
    }
    const { port } = preview;
    const requestId = crypto.randomUUID();
    const request = {};
    const finish = (target) => {
      clearTimeout(request.timer);
      port.removeEventListener('message', request.listener);
      pending.delete(requestId);
      resolve(target);
    };
    request.listener = ({ data }) => {
      if (data?.type === MESSAGE_TYPES.DROP_TARGET && data.payload?.requestId === requestId) {
        finish(data.payload);
      }
    };
    request.timer = setTimeout(() => finish(null), 2000);
    pending.set(requestId, finish);
    port.addEventListener('message', request.listener);
    port.start();
    if (!postPreview(port, {
      type: MESSAGE_TYPES.DROP_TARGET,
      payload: {
        phase: 'resolve',
        requestId,
        ...point,
        kind: drag.payload.files.length ? 'image' : 'html',
      },
    })) finish(null);
  });
  const hover = (drag, point) => {
    const coords = coordsFor(point);
    leave();
    if (!coords || !live(drag)) return;
    const position = docTarget(drag.view, coords);
    if (position !== null) {
      const rect = drag.view.coordsAtPos(position);
      indicator = document.createElement('div');
      indicator.setAttribute('aria-hidden', 'true');
      Object.assign(indicator.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483647',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        height: `${rect.bottom - rect.top}px`,
        borderLeft: '2px solid Highlight',
      });
      document.body.append(indicator);
    } else {
      const previewCoords = previewPoint(coords);
      if (previewCoords) {
        postPreview(preview.port, {
          type: MESSAGE_TYPES.DROP_TARGET,
          payload: { phase: 'hover', ...previewCoords, kind: drag.payload.files.length ? 'image' : 'html' },
        });
      }
    }
  };
  const commit = async (drag, point) => {
    const coords = coordsFor(point);
    if (!coords || !live(drag)) return { ok: false, error: 'cancelled' };
    const { view, payload: { files, data } } = drag;
    const { doc } = view.state;
    const position = docTarget(view, coords);
    const target = position === null ? await queryPreview(coords, drag) : null;
    const imageUtils = target || files.length
      ? await import(`${getNx2()}/public/utils/quick-edit-images.js`) : null;
    if (!live(drag)) return { ok: false, error: 'cancelled' };
    if (view.state.doc !== doc) return { ok: false, error: 'stale-target' };
    if (position === null && !target?.target) {
      return { ok: false, error: 'invalid-target' };
    }
    if (position === null && target.documentVersion !== imageUtils.getImageDocumentVersion(doc)) {
      return { ok: false, error: 'stale-preview' };
    }
    if (files.length) {
      if (position === null && files.length !== 1) return { ok: false, error: 'single-image-required' };
      const imagePos = position === null
        ? imageUtils.resolveImagePosition({ ...target.target, doc }) : null;
      const image = imagePos === null ? null : doc.nodeAt(imagePos);
      const path = (context.path || 'index').replace(/^\//, '').replace(/\.html?$/i, '');
      const parts = path.split('/');
      const name = parts.pop() || 'index';
      const parent = `/${context.org}/${context.site}${parts.length ? `/${parts.join('/')}` : ''}`;
      const { source } = await getNx2Api();
      const nodes = [];
      for (const file of files) {
        if (await refuseOversizedImage(file.size, parent)) {
          return { ok: false, error: 'image-too-large' };
        }
        if (!live(drag) || view.state.doc !== doc) {
          return { ok: false, error: 'stale-target' };
        }
        const response = await source.uploadMedia(`${parent}/.${name}/${file.name}`, { body: file });
        if (!response.ok) return { ok: false, error: 'upload-failed' };
        const { source: { contentUrl } } = await response.json();
        nodes.push(view.state.schema.nodes.image.create({ src: contentUrl }));
      }
      if (!live(drag) || view.state.doc !== doc) return { ok: false, error: 'stale-target' };
      if (image) {
        imageUtils.updateImageInDocument({ view, target: image, newSrc: nodes[0].attrs.src });
      } else {
        view.dispatch(view.state.tr.insert(position, Fragment.fromArray(nodes)).scrollIntoView());
      }
      return { ok: true };
    }
    if (data['text/html']?.trim()) {
      const ok = position === null
        ? handleHtmlDrop({ html: data['text/html'], ...target.target }, { view })
        : insertDroppedHtml({ view, html: data['text/html'], position });
      return { ok, ...(!ok && { error: 'invalid-html' }) };
    }
    if (position === null) {
      const paragraph = document.createElement('p');
      paragraph.textContent = data['text/plain'];
      return { ok: handleHtmlDrop({ html: paragraph.outerHTML, ...target.target }, { view }) };
    }
    view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(position)))
      .insertText(data['text/plain']).scrollIntoView());
    return { ok: true };
  };
  const controller = {
    async handle({ action, details = {} }) {
      if (action === 'dragStart') {
        const view = getView();
        if (active || !iframe.isConnected || !view?.editable || view.isDestroyed) {
          return { ok: false, error: 'unavailable' };
        }
        if (!validPayload(details.payload) || !coordsFor(details.point)) {
          return { ok: false, error: 'invalid-drag-data' };
        }
        const drag = {
          id: crypto.randomUUID(),
          view,
          listeners: new AbortController(),
          payload: { data: details.payload.data || {}, files: details.payload.files || [] },
        };
        drag.layer = document.createElement('div');
        drag.layer.setAttribute('aria-hidden', 'true');
        Object.assign(drag.layer.style, {
          position: 'fixed',
          inset: '0',
          zIndex: '2147483646',
          cursor: 'copy',
          touchAction: 'none',
        });
        active = drag;
        const { signal } = drag.listeners;
        const sourcePoint = (event) => {
          const rect = iframe.getBoundingClientRect();
          return {
            x: ((event.clientX - rect.left) * iframe.offsetWidth) / rect.width - iframe.clientLeft,
            y: ((event.clientY - rect.top) * iframe.offsetHeight) / rect.height - iframe.clientTop,
          };
        };
        drag.layer.addEventListener('pointermove', (event) => {
          drag.hostPointer = true;
          if (!drag.finishing) hover(drag, sourcePoint(event));
        }, { signal });
        drag.layer.addEventListener('pointerup', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          controller.handle({ action: 'dragFinish', details: { dragId: drag.id, point: sourcePoint(event) } });
        }, { signal });
        drag.layer.addEventListener('pointercancel', cancel, { signal });
        document.body.append(drag.layer);
        iframe.addEventListener('load', cancel, { signal });
        window.addEventListener('hashchange', cancel, { signal });
        window.addEventListener('blur', cancel, { signal });
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') cancel();
        }, { signal });
        drag.timer = setTimeout(cancel, 120_000);
        hover(drag, details.point);
        return { ok: true, dragId: drag.id };
      }
      const drag = active;
      if (!drag || details.dragId !== drag.id) return { ok: false, error: 'invalid-drag' };
      if (action === 'dragCancel') {
        cancel();
        return { ok: true };
      }
      if (action === 'dragMove') {
        if (!drag.finishing && !drag.hostPointer) hover(drag, details.point);
        return { ok: true };
      }
      if (action !== 'dragFinish') return { ok: false, error: 'unsupported' };
      if (drag.finishing) return drag.finishing;
      leave();
      drag.finishing = commit(drag, details.point)
        .catch(() => ({ ok: false, error: 'drop-failed' }))
        .then((result) => {
          drag.result = result;
          return result;
        })
        .finally(() => { if (active === drag) cancel(); });
      return drag.finishing;
    },
    destroy() {
      cancel();
      unsubscribe();
    },
  };
  return controller;
}
