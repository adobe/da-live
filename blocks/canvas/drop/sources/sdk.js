import { getNx } from '../../../../scripts/utils.js';
import { fromSdk } from '../payload.js';
import { uploadContext } from '../content.js';
import { startSession } from '../session.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);

let current = {};
hashChange.subscribe(({ org, site, path }) => { current = { org, site, path }; });

const samePage = (a, b) => a.org === b.org && a.site === b.site
  && (a.path || '') === (b.path || '');

// Extension iframe -> host viewport coordinates (the panel may be scaled and bordered).
function hostPoint(iframe, point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !iframe.isConnected) return null;
  const rect = iframe.getBoundingClientRect();
  if (!rect.width || !rect.height || !iframe.offsetWidth || !iframe.offsetHeight) return null;
  return {
    x: rect.left + ((iframe.clientLeft + point.x) * rect.width) / iframe.offsetWidth,
    y: rect.top + ((iframe.clientTop + point.y) * rect.height) / iframe.offsetHeight,
  };
}

/**
 * Extension SDK drag protocol (`dragStart`/`dragMove`/`dragFinish`/`dragCancel`).
 * The extension starts the drag in its iframe; the host session takes over the pointer.
 * `dragFinish` resolves with the drop result; when the host ends the drag itself
 * (release over the host, Escape, blur) the result is reported via `notify`.
 *
 * @param {object} opts
 * @param {HTMLIFrameElement} opts.iframe the extension iframe
 * @param {() => object} opts.getView
 * @param {{ org, site, path }} opts.page the page the extension was opened on
 * @param {(details: { dragId, result }) => void} opts.notify
 */
export function createSdkDragSource({ iframe, getView, page, notify }) {
  let session;
  let reported = false;
  const liveView = () => (iframe.isConnected && samePage(current, page) ? getView() : null);
  const onLoad = () => session?.cancel();
  iframe.addEventListener('load', onLoad);

  const start = ({ payload: raw, point } = {}) => {
    session?.cancel();
    const payload = fromSdk(raw);
    const at = hostPoint(iframe, point);
    if (!payload || !at) return { ok: false, error: 'invalid-drag-data' };
    reported = false;
    const started = startSession({
      payload,
      getView: liveView,
      getContext: () => uploadContext(page),
      onEnd: (result) => {
        if (session === started) session = undefined;
        if (!reported) notify({ dragId: started.id, result });
      },
    });
    if (!started) return { ok: false, error: 'unavailable' };
    session = started;
    session.move(at);
    return { ok: true, dragId: session.id };
  };

  return {
    async handle({ action, details = {} }) {
      if (action === 'dragStart') return start(details);
      if (!session || details.dragId !== session.id) return { ok: false, error: 'invalid-drag' };
      if (action === 'dragMove') {
        session.move(hostPoint(iframe, details.point));
        return { ok: true };
      }
      if (action === 'dragCancel') {
        session.cancel();
        return { ok: true };
      }
      if (action === 'dragFinish') {
        reported = true;
        return session.finish(hostPoint(iframe, details.point));
      }
      return { ok: false, error: 'unsupported' };
    },
    destroy() {
      iframe.removeEventListener('load', onLoad);
      session?.cancel();
    },
  };
}
