import { DA_ADMIN, DA_CONTENT } from '../../../shared/nxutils.js';

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
    // eslint-disable-next-line no-console
    console.log('handleImageReplace', fileName, originalSrc);

    const blob = dataUrlToBlob(imageData);

    const pageName = getPageName(ctx.path);
    const parentPath = ctx.path === '/' ? '' : ctx.path.replace(/\/[^/]+$/, '');

    // Same upload path and URL as da-nx quick-edit-portal/src/images.js
    const uploadPath = `${parentPath}/.${pageName}/${fileName}`;
    const uploadUrl = `${DA_ADMIN}/source/${ctx.owner}/${ctx.repo}${uploadPath}`;

    const tokenPromise = typeof ctx.getToken === 'function' ? ctx.getToken() : null;
    const token = tokenPromise != null && typeof tokenPromise?.then === 'function'
      ? await tokenPromise
      : tokenPromise;
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const formData = new FormData();
    formData.append('data', blob, fileName);

    const resp = await fetch(uploadUrl, {
      method: 'PUT',
      body: formData,
      headers,
    });

    if (!resp.ok) {
      ctx.port.postMessage({
        type: 'image-error',
        error: `Upload failed with status ${resp.status}`,
        originalSrc,
      });
      return;
    }

    // Same as da-nx: AEM delivery URL for the uploaded image
    const newSrc = `${DA_CONTENT}/${ctx.owner}/${ctx.repo}${uploadPath}`;

    updateImageInDocument(ctx.view, originalSrc, newSrc);

    ctx.port.postMessage({
      type: 'update-image-src',
      newSrc,
      originalSrc,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error replacing image:', error);
    ctx.port.postMessage({
      type: 'image-error',
      error: error.message,
      originalSrc,
    });
  } finally {
    setTimeout(() => {
      ctx.suppressRerender = false;
    }, 500);
  }
}
