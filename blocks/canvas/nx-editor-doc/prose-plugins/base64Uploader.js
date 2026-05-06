import { Plugin } from 'da-y-wrapper';
import { DA_ADMIN, DA_CONTENT } from '../../../shared/nxutils.js';
import { daFetch } from '../../../shared/utils.js';
import { getSourceUploadContext } from './sourceUploadContext.js';

const FPO_IMG_URL = 'https://da.live/blocks/edit/img/fpo.svg';

function makeHash(string) {
  return Math.abs(string.split('').reduce((hash, char) => (
    // eslint-disable-next-line no-bitwise -- same hash as da.live paste uploader
    char.charCodeAt(0) + (hash << 6) + (hash << 16) - hash
  ), 0));
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

          const imagePaths = [];
          const uploadPromises = [];

          dataImgs.forEach((img) => {
            const src = img.getAttribute('src');
            let ext = src.replace('data:image/', '').split(';base64')[0];
            if (ext === 'jpeg') ext = 'jpg';
            const path = `${details.parent}/.${details.name}/wp${makeHash(src)}.${ext}`;
            const fpoSrc = `${FPO_IMG_URL}#${DA_CONTENT}${path}`;
            img.setAttribute('src', fpoSrc);
            imagePaths.push(fpoSrc);

            uploadPromises.push((async () => {
              const resp = await fetch(src);
              const blob = await resp.blob();
              const body = new FormData();
              body.append('data', blob);
              await daFetch(`${DA_ADMIN}/source${path}`, { body, method: 'POST' });
            })());
          });

          Promise.all(uploadPromises).then(() => {
            const view = getEditorView();
            if (!view) return;
            const { tr } = view.state;

            view.state.doc.descendants((node, pos) => {
              if (node.type.name === 'image' && imagePaths.includes(node.attrs.src)) {
                const newAttrs = { src: node.attrs.src.split('#')[1] };
                tr.setNodeMarkup(pos, null, { ...node.attrs, ...newAttrs });
              }
            });

            view.dispatch(tr);
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
