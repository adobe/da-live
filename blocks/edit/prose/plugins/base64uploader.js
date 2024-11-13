import { Plugin } from 'da-y-wrapper';
import getPathDetails from '../../../shared/pathDetails.js';
import { daFetch } from '../../../shared/utils.js';
import { DA_ORIGIN, CON_ORIGIN } from '../../../shared/constants.js';

const ALLOWED_TYPES = [
  {
    type: 'image/png',
    ext: '.png',
  },
  {
    type: 'image/jpeg',
    ext: '.jpg',
  },
  {
    type: 'image/gif',
    ext: '.png',
  },
];

const FPO_IMG_URL = 'https://content.da.live/auniverseaway/da/assets/fpo.svg';

function makeHash(string) {
  return string.split('').reduce(
    // eslint-disable-next-line no-bitwise
    (hash, char) => char.charCodeAt(0) + (hash << 6) + (hash << 16) - hash,
    0,
  );
}

function replaceWordImage(path) {
  const { view } = window;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.src === path) {
      const newAttrs = { src: node.attrs.src.split('#')[1] };
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, ...newAttrs }),
      );
    }
  });
}

/* When text is pasted, handle section breaks. */
export default function base64Uploader() {
  return new Plugin({
    props: {
      transformPastedHTML: (html) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const imgs = [...doc.querySelectorAll('[src^="data:image"]')];
          imgs.map(async (img) => {
            const src = img.getAttribute('src');
            let ext = src.replace('data:image/', '').split(';base64')[0];
            if (ext === 'jpeg') ext = 'jpg';
            const { parent, name } = getPathDetails();
            // WP = Word Paste
            const path = `${parent}/${name}-wp${makeHash(src)}.${ext}`;
            img.setAttribute('src', `${FPO_IMG_URL}#${CON_ORIGIN}${path}`);

            const resp = await fetch(src);
            const blob = await resp.blob();

            const body = new FormData();
            body.append('data', blob);
            await daFetch(`${DA_ORIGIN}/source${path}`, { body, method: 'POST' });

            replaceWordImage(`${FPO_IMG_URL}#${CON_ORIGIN}${path}`);
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
