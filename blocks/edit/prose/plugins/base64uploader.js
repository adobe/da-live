import { Plugin } from 'da-y-wrapper';
import getPathDetails from '../../../shared/pathDetails.js';
import { daFetch } from '../../../shared/utils.js';
import { DA_ORIGIN, CON_ORIGIN } from '../../../shared/constants.js';

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';

function makeHash(string) {
  return Math.abs(string.split('').reduce(
    // eslint-disable-next-line no-bitwise
    (hash, char) => char.charCodeAt(0) + (hash << 6) + (hash << 16) - hash,
    0,
  ));
}

/**
 * Base 64 Uploader
 * @returns {Plugin} the base64 uploader plugin
 */
export default function base64Uploader() {
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

          const imagePaths = [];
          const uploadPromises = [];

          dataImgs.forEach((img) => {
            const src = img.getAttribute('src');
            let ext = src.replace('data:image/', '').split(';base64')[0];
            if (ext === 'jpeg') ext = 'jpg';
            const { parent, name } = getPathDetails();
            const path = `${parent}/.${name}/wp${makeHash(src)}.${ext}`; // WP = Word Paste
            const fpoSrc = `${FPO_IMG_URL}#${CON_ORIGIN}${path}`;
            img.setAttribute('src', fpoSrc);
            imagePaths.push(fpoSrc);

            uploadPromises.push((async () => {
              const resp = await fetch(src);
              const blob = await resp.blob();
              const body = new FormData();
              body.append('data', blob);
              await daFetch(`${DA_ORIGIN}/source${path}`, { body, method: 'POST' });
            })());
          });

          Promise.all(uploadPromises).then(() => {
            const { view } = window;
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
