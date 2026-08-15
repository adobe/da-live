// eslint-disable-next-line import/no-unresolved
import { Plugin, PluginKey } from 'da-y-wrapper';
import { getPreviewOrigin } from '../../editor-utils/editor-utils.js';

const mediaBusImageKey = new PluginKey('canvasMediaBusImage');

// a media bus src ("./media_123.png") only resolves where the page is served, so it is rewritten
// to the doc's preview origin for display; node attrs and the saved document keep the relative
// path. getPreviewOrigin matches the origin fetchWysiwygCookie logs into, unlike getLivePreviewUrl.
export function getRenderableSrc(src, ctx) {
  if (!src || !src.startsWith('./media_')) return null;
  const { org, repo } = ctx ?? {};
  if (!org || !repo) return null;
  return `${getPreviewOrigin(org, repo)}/${src.slice(2)}`;
}

function updateImageSrcs(view, ctx) {
  view.dom.querySelectorAll('img[src^="./media_"]').forEach((img) => {
    const renderableSrc = getRenderableSrc(img.getAttribute('src'), ctx);
    if (renderableSrc) img.src = renderableSrc;
  });
}

export default function mediaBusImage(ctx) {
  return new Plugin({
    key: mediaBusImageKey,
    view(view) {
      updateImageSrcs(view, ctx);
      return {
        update(updatedView, prevState) {
          if (updatedView.state.doc !== prevState.doc) updateImageSrcs(updatedView, ctx);
        },
      };
    },
  });
}
