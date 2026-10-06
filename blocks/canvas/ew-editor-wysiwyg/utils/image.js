import { getNx2, getNx2Api } from '../../../../scripts/utils.js';
import { MESSAGE_TYPES } from '../../utils/quick-edit-messages.js';
import { dataUrlByteLength, refuseOversizedImage } from '../../utils/image-upload.js';

const { resolveImagePosition, updateImageInDocument } = await import(
  `${getNx2()}/public/utils/quick-edit-images.js`
);

function dataUrlToBlob(dataUrl) {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const byteString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i += 1) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new Blob([uint8Array], { type: mimeType });
}

function getPageName(currentPath) {
  if (currentPath.endsWith('/')) return `${currentPath.replace(/^\//, '')}index`;
  return currentPath.replace(/^\//, '');
}

export async function handleImageReplace(payload, ctx) {
  const { imageData, fileName, proseIndex, originalSrc, requestId } = payload;
  let view;
  const reply = (result) => ctx.port.postMessage({
    type: MESSAGE_TYPES.IMAGE_REPLACE,
    payload: { ...result, proseIndex, originalSrc, requestId },
  });
  try {
    view = ctx.view;
    if (!view) throw new Error('Image editor is unavailable. Please try again.');
    const originalDoc = view.state.doc;
    const imagePos = resolveImagePosition({ ...payload, doc: originalDoc });
    const target = originalDoc.nodeAt(imagePos);
    const sitePath = `/${ctx.owner}/${ctx.repo}`;
    if (await refuseOversizedImage(dataUrlByteLength(imageData), sitePath)) {
      reply({ error: 'Image is too large' });
      return;
    }

    const blob = dataUrlToBlob(imageData);

    const pageName = getPageName(ctx.path);
    const parentPath = ctx.path === '/' ? '' : ctx.path.replace(/\/[^/]+$/, '');

    // Same upload path as da-nx quick-edit-portal/src/images.js
    const uploadPath = `/${ctx.owner}/${ctx.repo}${parentPath}/.${pageName}/${fileName}`;

    const { source } = await getNx2Api();
    const resp = await source.uploadMedia(uploadPath, { body: blob });

    if (!resp.ok) {
      reply({ error: `Upload failed with status ${resp.status}` });
      return;
    }

    // the media bus is content addressed, so the src is only known from the response
    const { source: { contentUrl: newSrc } } = await resp.json();

    if (ctx.view !== view) throw new Error('Image editor changed during the upload. Please try again.');
    updateImageInDocument({ view, target, newSrc });
    reply({ newSrc });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error replacing image:', error);
    reply({ error: error.message });
  }
}
