// eslint-disable-next-line import/no-unresolved
import { Plugin, PluginKey } from 'da-y-wrapper';
import { getLivePreviewUrl } from '../../../shared/constants.js';

const mediaBusImageKey = new PluginKey('canvasMediaBusImage');

// A document on the media bus stores an image src relative to the published page
// ("./media_123.png"), which only resolves where the page is served from. The canvas runs on
// another origin, so the src is rewritten to the doc's preview origin for display. The node attrs
// keep the relative path, and so does the saved document.
export function getRenderableSrc(src, ctx) {
  if (!src || !src.startsWith('./media_')) return null;
  const { org, repo } = ctx ?? {};
  if (!org || !repo) return null;
  return `${getLivePreviewUrl(org, repo)}/${src.slice(2)}`;
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
