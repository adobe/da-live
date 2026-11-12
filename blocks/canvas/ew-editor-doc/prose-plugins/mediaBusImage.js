// eslint-disable-next-line import/no-unresolved
import { Plugin, PluginKey } from 'da-y-wrapper';
import { getRenderableSrc } from '../../../shared/constants.js';

const mediaBusImageKey = new PluginKey('canvasMediaBusImage');

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
