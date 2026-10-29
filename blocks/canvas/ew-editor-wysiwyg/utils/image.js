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
    if (payload.assets) {
      if (!Array.isArray(payload.assets) || payload.assets.length !== 1) {
        throw new Error('Drop a single image asset to replace this image.');
      }
      const [
        { getRepositoryConfig }, { buildAssetNodes, NOT_CONFIGURED_ERROR },
      ] = await Promise.all([
        import(`${getNx2()}/utils/aem-assets/repository-config.js`),
        import('../../ew-editor-doc/prose-plugins/assetDrop.js'),
      ]);
      const config = await getRepositoryConfig(ctx.owner, ctx.repo);
      if (!config) throw new Error(NOT_CONFIGURED_ERROR);
      const { nodes, errors } = await buildAssetNodes(view.state.schema, payload.assets, config);
      if (nodes.length !== 1 || nodes[0].type.name !== 'image') {
        throw new Error(errors[0] || 'The dropped asset cannot replace an image.');
      }
      if (ctx.view !== view || !view.editable || ctx.canWrite === false) {
        throw new Error('Image editor changed during the drop. Please try again.');
      }
      const newSrc = nodes[0].attrs.src;
      updateImageInDocument({ view, target, newSrc });
      reply({ newSrc });
      return;
    }
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
