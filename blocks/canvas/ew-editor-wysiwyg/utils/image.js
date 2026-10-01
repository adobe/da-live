import { getNx2Api } from '../../../../scripts/utils.js';
import { MESSAGE_TYPES } from '../../utils/quick-edit-messages.js';
import { dataUrlByteLength, refuseOversizedImage } from '../../utils/image-upload.js';

function srcMatches(currentSrc, originalSrc) {
  if (currentSrc === originalSrc) return true;
  try {
    const currentUrl = new URL(currentSrc, window.location.href);
    const originalUrl = new URL(originalSrc, window.location.href);
    return currentUrl.pathname === originalUrl.pathname;
  } catch {
    return currentSrc.includes(originalSrc) || originalSrc.includes(currentSrc);
  }
}

// The replacement is an uploaded DA media file, not an AEM asset, so it must not keep
// the editable-link marker (which would persist it as a text link).
const replacedAttrs = (node, newSrc) => ({ ...node.attrs, src: newSrc, editAs: null });

function imageAt(doc, pos) {
  if (!doc || pos == null || pos < 0 || pos > doc.content.size) return null;
  const node = doc.nodeAt(pos);
  return node?.type.name === 'image' ? node : null;
}

// indexedSrc is the doc src of the image at imageIndex when the drop arrived. The iframe's
// src can't be compared instead: it is resolved against the preview origin and may be a
// site-rewritten rendition of the doc src.
function updateImageInDocument(view, originalSrc, newSrc, imageIndex, indexedSrc) {
  if (!view) return false;

  const { state } = view;
  const { tr } = state;

  // Prefer the exact dropped node; the src fallback would also hit every other image
  // sharing its path (e.g. two smart crops of one asset). The src check catches a
  // position that drifted during the upload.
  const indexed = imageAt(state.doc, imageIndex);
  if (indexed && indexedSrc != null && indexed.attrs.src === indexedSrc) {
    view.dispatch(tr.setNodeMarkup(imageIndex, null, replacedAttrs(indexed, newSrc)));
    return true;
  }

  let updated = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && srcMatches(node.attrs.src, originalSrc)) {
      tr.setNodeMarkup(pos, null, replacedAttrs(node, newSrc));
      updated = true;
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

export async function handleImageReplace({ imageData, fileName, originalSrc, imageIndex }, ctx) {
  ctx.suppressRerender = true;
  const indexedSrc = imageAt(ctx.view?.state.doc ?? null, imageIndex)?.attrs.src;

  try {
    const sitePath = `/${ctx.owner}/${ctx.repo}`;
    if (await refuseOversizedImage(dataUrlByteLength(imageData), sitePath)) {
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

    updateImageInDocument(ctx.view, originalSrc, newSrc, imageIndex, indexedSrc);

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
