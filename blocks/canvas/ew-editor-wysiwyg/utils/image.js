import { MESSAGE_TYPES } from '../../utils/quick-edit-messages.js';
import { fromImageData } from '../../drop/payload.js';
import { uploadContext } from '../../drop/content.js';
import { performDrop } from '../../drop/pipeline.js';

/**
 * quick-edit IMAGE_REPLACE request: a native file dropped on an existing preview image
 * (an OS drop) or picked from its replace action. Adapts it into the shared drop pipeline.
 */
export async function handleImageReplace(payload, ctx) {
  const {
    imageData, fileName, mimeType, proseIndex, originalSrc, requestId, imageVersion,
  } = payload;
  const reply = (result) => ctx.port.postMessage({
    type: MESSAGE_TYPES.IMAGE_REPLACE,
    payload: { ...result, proseIndex, originalSrc, requestId },
  });
  const { view } = ctx;
  const files = fromImageData({ imageData, fileName, mimeType });
  if (!files) {
    reply({ error: 'The dropped file is not a supported image.' });
    return;
  }
  const result = await performDrop({
    payload: files,
    target: {
      editor: 'wysiwyg', type: 'image', proseIndex, imageVersion, originalSrc, requestId,
    },
    view,
    context: uploadContext({ org: ctx.owner, site: ctx.repo, path: ctx.path }),
    isLive: () => ctx.view === view && ctx.canWrite !== false,
  });
  if (result.ok) reply({ newSrc: result.src });
  else reply({ error: result.message || result.error });
}
