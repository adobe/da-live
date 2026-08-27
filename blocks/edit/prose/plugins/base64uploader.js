import { Plugin, PluginKey } from 'da-y-wrapper';
import getPathDetails from '../../../shared/pathDetails.js';
import { getNx2Api } from '../../../../scripts/utils.js';

const base64UploaderKey = new PluginKey('base64Uploader');

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';

function makeHash(string) {
  return Math.abs(string.split('').reduce(
    // eslint-disable-next-line no-bitwise
    (hash, char) => char.charCodeAt(0) + (hash << 6) + (hash << 16) - hash,
    0,
  ));
}

// Uploads a single pasted base64 image and swaps its FPO placeholder for the
// real content URL. uploadMedia content-addresses the file, so the final URL
// (possibly a relative ./media_... path) is only known from the response —
// unlike source.save, it can't be derived from the upload path upfront.
export async function uploadBase64Image(view, { src, path, fpoSrc }) {
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
 * Base 64 Uploader
 * @returns {Plugin} the base64 uploader plugin
 */
export default function base64Uploader() {
  return new Plugin({
    key: base64UploaderKey,
    props: {
      transformPastedHTML: (html) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const dataImgs = [...doc.querySelectorAll('[src^="data:image"]')];
          if (!dataImgs.length) {
            return html;
          }

          dataImgs.forEach((img) => {
            const src = img.getAttribute('src');
            let ext = src.replace('data:image/', '').split(';base64')[0];
            if (ext === 'jpeg') ext = 'jpg';
            const { parent, name } = getPathDetails();
            const path = `${parent}/.${name}/wp${makeHash(src)}.${ext}`; // WP = Word Paste
            const fpoSrc = `${FPO_IMG_URL}#${makeHash(src)}`;
            img.setAttribute('src', fpoSrc);

            uploadBase64Image(window.view, { src, path, fpoSrc });
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
