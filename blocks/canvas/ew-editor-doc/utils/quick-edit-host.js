import { createControllerOnMessage } from '../../ew-editor-wysiwyg/quick-edit-controller.js';
import { getNx } from '../../../../scripts/utils.js';
import { updateDocument, updateCursors, fetchWysiwygCookie } from '../../editor-utils/editor-utils.js';

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
