import { createControllerOnMessage } from '../../nx-editor-wysiwyg/quick-edit-controller.js';
import { getNx } from '../../../shared/nxutils.js';
import { updateDocument, updateCursors } from '../../editor-utils/document.js';
import { fetchWysiwygCookie } from '../../editor-utils/preview.js';

export function prefetchWysiwygCookiesIfSignedIn(ctx) {
  const { org, repo } = ctx ?? {};
  if (!org || !repo) return;
  (async () => {
    const { loadIms } = await import(`${getNx()}/utils/ims.js`);
    const token = (await loadIms())?.accessToken?.token;
    if (token) {
      await fetchWysiwygCookie({ org, repo, token }).catch(() => {});
    }
  })().catch(() => {});
}

export function wireQuickEditControllerPort(controllerCtx) {
  controllerCtx.port.onmessage = createControllerOnMessage(controllerCtx);
  const sendInitialBodyAndCursors = () => {
    if (!controllerCtx.port) return;
    updateDocument(controllerCtx);
    updateCursors(controllerCtx);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(sendInitialBodyAndCursors);
  });
}
