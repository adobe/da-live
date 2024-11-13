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

function getExtension(blob) {
  const match = ALLOWED_TYPES.find((allowed) => (allowed.type === blob.type));
  if (match) return match.ext;
  return null;
}

/* When text is pasted, handle section breaks. */
export default function sectionPasteHandler() {
  return new Plugin({
    props: {
      transformPastedHTML: (html) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          const imgs = [...doc.querySelectorAll('[src^="data:image"]')];
          imgs.map(async (img, idx) => {
            const url = img.src;
            const resp = await fetch(url);
            const blob = await resp.blob();
            const ext = getExtension(blob);
            if (!ext) return;

            const { parent, name } = getPathDetails();
            // WP = Word Paste
            const path = `${parent}/${name}-wp-${idx + 1}${ext}`;
            img.setAttribute('src', `${CON_ORIGIN}${path}`);

            const body = new FormData();
            body.append('data', blob);
            await daFetch(`${DA_ORIGIN}/source${path}`, { body, method: 'POST' });
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
