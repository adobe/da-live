import { getNx2Api } from '../../../../scripts/utils.js';
import { MESSAGE_TYPES } from '../../utils/quick-edit-messages.js';
import { dataUrlByteLength, refuseOversizedImage } from '../../utils/image-upload.js';
import { getImageDocumentVersion } from '../../utils/image-document-version.js';

function resolveImagePosition(doc, { proseIndex, originalSrc, requestId, imageVersion }) {
  if (proseIndex != null || requestId != null) {
    if (imageVersion !== getImageDocumentVersion(doc)) {
      throw new Error('Image position is out of date. Please refresh and try again.');
    }
    if (!Number.isSafeInteger(proseIndex) || proseIndex < 0
      || doc.nodeAt(proseIndex)?.type.name !== 'image') {
      throw new Error('Image position is no longer valid. Please refresh and try again.');
    }
    return proseIndex;
  }

  // Older quick-edit iframes send only a URL; never pick one of several matches.
  const name = originalSrc?.split(/[?#]/)[0].split('/').pop();
  let found = null;
  let ambiguous = false;
  if (name) {
    doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs.src?.split(/[?#]/)[0].split('/').pop() === name) {
        if (found != null) ambiguous = true;
        else found = pos;
      }
    });
  }
  if (found == null || ambiguous) {
    throw new Error('Image position is missing or ambiguous. Please refresh and try again.');
  }
  return found;
}

function updateImageInDocument(view, proseIndex, newSrc, originalDoc) {
  if (view.state.doc !== originalDoc) {
    throw new Error('The page changed during the image upload. Please try again.');
  }
  const node = originalDoc.nodeAt(proseIndex);
  if (node?.type.name !== 'image') {
    throw new Error('The selected image is no longer available. Please try again.');
  }
  view.dispatch(view.state.tr.setNodeMarkup(proseIndex, null, { ...node.attrs, src: newSrc }));
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

export async function handleImageReplace(payload, ctx) {
  const { imageData, fileName, proseIndex, originalSrc, requestId } = payload;
  const reply = (result) => ctx.port.postMessage({
    type: MESSAGE_TYPES.IMAGE_REPLACE,
    payload: { ...result, proseIndex, originalSrc, requestId },
  });
  try {
    if (!ctx.view) throw new Error('Image editor is unavailable. Please try again.');
    const originalDoc = ctx.view.state.doc;
    const imagePos = resolveImagePosition(originalDoc, payload);
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

    updateImageInDocument(ctx.view, imagePos, newSrc, originalDoc);
    reply({ newSrc });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error replacing image:', error);
    reply({ error: error.message });
  }
}
