import { PAYLOAD_KIND } from './payload.js';
import { createTargetIndicator, resolveTarget } from './targets.js';
import { performDrop } from './pipeline.js';

const SESSION_TIMEOUT = 120_000;

let active;

/**
 * A host-owned drag for sources that live in another iframe (extensions, the assets rail).
 * A full-viewport overlay captures pointer and native drag events so the source iframe,
 * the doc editor, and the preview iframe cannot swallow them; all points are host
 * viewport coordinates. Every drop goes through performDrop.
 *
 * @param {object} opts
 * @param {object} opts.payload DropPayload (see payload.js)
 * @param {() => object} opts.getView the current ProseMirror view
 * @param {() => object} opts.getContext `{ org, site, parent, name }` for the current page
 * @param {HTMLElement} [opts.ghost] follows the pointer
 * @param {(result) => void} [opts.onEnd] called once, with the drop result or a cancellation
 */
export function startSession({ payload, getView, getContext, ghost, onEnd = () => {} }) {
  active?.cancel();
  const view = getView();
  if (!payload || !view || view.isDestroyed || !view.editable) return null;

  const id = crypto.randomUUID();
  const kind = payload.kind === PAYLOAD_KIND.HTML ? 'html' : 'image';
  const indicator = createTargetIndicator();
  const listeners = new AbortController();
  const { signal } = listeners;
  const overlay = document.createElement('div');
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483646', cursor: 'copy', touchAction: 'none' });
  if (ghost) {
    Object.assign(ghost.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none' });
    overlay.append(ghost);
  }

  let lastPoint;
  let frame;
  let finishing;
  let ended = false;
  let timer;
  let session;

  const teardown = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    listeners.abort();
    overlay.remove();
    indicator.clear();
    if (active === session) active = undefined;
  };

  const end = (result) => {
    if (ended) return;
    ended = true;
    onEnd(result);
  };

  const validPoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);

  const move = (point) => {
    if (finishing || !validPoint(point)) return;
    lastPoint = point;
    if (ghost) ghost.style.transform = `translate(${point.x + 12}px, ${point.y + 12}px)`;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => indicator.hover({ point, kind, view, overlay }));
  };

  const drop = async (point) => {
    const target = await resolveTarget({ point, kind, view, overlay });
    if (!target) return { ok: false, error: 'invalid-target' };
    const isLive = () => getView() === view;
    return performDrop({ payload, target, view, context: getContext(), isLive });
  };

  const finish = (point) => {
    if (finishing) return finishing;
    const at = validPoint(point) ? point : lastPoint;
    cancelAnimationFrame(frame);
    indicator.clear();
    finishing = (at ? drop(at) : Promise.resolve({ ok: false, error: 'invalid-target' }))
      .catch(() => ({ ok: false, error: 'drop-failed' }))
      .then((result) => {
        teardown();
        end(result);
        return result;
      });
    overlay.style.visibility = 'hidden';
    return finishing;
  };

  const cancel = () => {
    if (finishing) return;
    teardown();
    end({ ok: false, error: 'cancelled' });
  };

  const fromEvent = (event) => ({ x: event.clientX, y: event.clientY });
  overlay.addEventListener('pointermove', (event) => move(fromEvent(event)), { signal });
  overlay.addEventListener('pointerup', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    finish(fromEvent(event));
  }, { signal });
  overlay.addEventListener('pointercancel', cancel, { signal });
  // a source may run a native drag (the asset selector does); it lands on the overlay
  overlay.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    move(fromEvent(event));
  }, { signal });
  overlay.addEventListener('drop', (event) => {
    event.preventDefault();
    finish(fromEvent(event));
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancel();
  }, { capture: true, signal });
  window.addEventListener('blur', cancel, { signal });
  timer = setTimeout(cancel, SESSION_TIMEOUT);

  document.body.append(overlay);
  session = { id, move, finish, cancel };
  active = session;
  return session;
}
