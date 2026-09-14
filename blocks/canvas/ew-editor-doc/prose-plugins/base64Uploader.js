import { Plugin } from 'da-y-wrapper';
import { getNx2Api } from '../../../../scripts/utils.js';
import { getSourceUploadContext } from './sourceUploadContext.js';
import { dataUrlByteLength, refuseOversizedImage } from '../../utils/image-upload.js';

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';

function makeHash(string) {
  return Math.abs(string.split('').reduce((hash, char) => (
    // eslint-disable-next-line no-bitwise -- same hash as da.live paste uploader
    char.charCodeAt(0) + (hash << 6) + (hash << 16) - hash
  ), 0));
}

// the media bus is content addressed, so the src is only known from the response
function removeFpo(view, fpoSrc) {
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.src === fpoSrc) {
      view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
      return false;
    }
    return true;
  });
}

export async function uploadBase64Image(view, { src, path, fpoSrc, parent }) {
  if (await refuseOversizedImage(dataUrlByteLength(src), parent)) {
    removeFpo(view, fpoSrc);
    return;
  }
  const resp = await fetch(src);
  const blob = await resp.blob();
  const { source } = await getNx2Api();
  const uploadResp = await source.uploadMedia(path, { body: blob });
  if (!uploadResp.ok) {
    // eslint-disable-next-line no-console
    console.error(`Failed to upload pasted image: ${uploadResp.status} ${uploadResp.statusText}`);
    return;
  }
  const { source: { contentUrl } } = await uploadResp.json();

  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.src === fpoSrc) {
      view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, src: contentUrl }));
      return false;
    }
    return true;
  });
}

/**
 * @param {{
 *   getSourceUrl: () => string | null,
 *   getEditorView: () => import('prosemirror-view').EditorView | null,
 * }} opts
 */
export default function base64Uploader({ getSourceUrl, getEditorView }) {
  return new Plugin({
    props: {
      transformPastedHTML: (html) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const dataImgs = [...doc.querySelectorAll('[src^="data:image"]')];
          if (!dataImgs.length) {
            return html;
          }

          const details = getSourceUploadContext(getSourceUrl() ?? '');
          if (!details) return html;

          dataImgs.forEach((img) => {
            const src = img.getAttribute('src');
            let ext = src.replace('data:image/', '').split(';base64')[0];
            if (ext === 'jpeg') ext = 'jpg';
            const path = `${details.parent}/.${details.name}/wp${makeHash(src)}.${ext}`;
            const fpoSrc = `${FPO_IMG_URL}#${makeHash(src)}`;
            img.setAttribute('src', fpoSrc);

            const view = getEditorView();
            if (view) uploadBase64Image(view, { src, path, fpoSrc, parent: details.parent });
          });

          const serializer = new XMLSerializer();
          return serializer.serializeToString(doc);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error handling Base64 images:', error);
          return html;
        }
      },
    },
  });
}
