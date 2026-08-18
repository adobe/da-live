import { getNx2Api } from '../../../../scripts/utils.js';
import { MESSAGE_TYPES } from '../../utils/quick-edit-messages.js';
import { dataUrlByteLength, isImageTooLarge, showImageTooLarge } from '../../utils/image-upload.js';

function updateImageInDocument(view, originalSrc, newSrc) {
  if (!view) return false;

  const { state } = view;
  const { tr } = state;
  let updated = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      const currentSrc = node.attrs.src;
      let isMatch = currentSrc === originalSrc;

      if (!isMatch) {
        try {
          const currentUrl = new URL(currentSrc, window.location.href);
          const originalUrl = new URL(originalSrc, window.location.href);
          isMatch = currentUrl.pathname === originalUrl.pathname;
        } catch {
          isMatch = currentSrc.includes(originalSrc) || originalSrc.includes(currentSrc);
        }
      }

      if (isMatch) {
        const newAttrs = { ...node.attrs, src: newSrc };
        tr.setNodeMarkup(pos, null, newAttrs);
        updated = true;
      }
    }
  });

  if (updated) {
    view.dispatch(tr);
  }

  return updated;
}

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

export async function handleImageReplace({ imageData, fileName, originalSrc }, ctx) {
  ctx.suppressRerender = true;

  try {
    if (isImageTooLarge(dataUrlByteLength(imageData))) {
      await showImageTooLarge();
      ctx.port.postMessage({
        type: MESSAGE_TYPES.IMAGE_REPLACE,
        payload: { error: 'Image is too large', originalSrc },
      });
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
      const error = `Upload failed with status ${resp.status}`;
      ctx.port.postMessage({
        type: MESSAGE_TYPES.IMAGE_REPLACE,
        payload: { error, originalSrc },
      });
      return;
    }

    // the media bus is content addressed, so the src is only known from the response
    const { source: { contentUrl: newSrc } } = await resp.json();

    updateImageInDocument(ctx.view, originalSrc, newSrc);

    ctx.port.postMessage({
      type: MESSAGE_TYPES.IMAGE_REPLACE,
      payload: { newSrc, originalSrc },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error replacing image:', error);
    ctx.port.postMessage({
      type: MESSAGE_TYPES.IMAGE_REPLACE,
      payload: { error: error.message, originalSrc },
    });
  } finally {
    setTimeout(() => {
      ctx.suppressRerender = false;
    }, 500);
  }
}
