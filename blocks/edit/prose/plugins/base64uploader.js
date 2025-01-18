import { Plugin } from 'da-y-wrapper';
import getPathDetails from '../../../shared/pathDetails.js';
import { daFetch } from '../../../shared/utils.js';
import { DA_ORIGIN, CON_ORIGIN } from '../../../shared/constants.js';

const FPO_IMG_URL = 'https://content.da.live/auniverseaway/da/assets/fpo.svg';

function makeHash(string) {
  return Math.abs(string.split('').reduce(
    // eslint-disable-next-line no-bitwise
    (hash, char) => char.charCodeAt(0) + (hash << 6) + (hash << 16) - hash,
    0,
  ));
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

/**
 * Base 64 Uploader
 * @returns {Plugin} the base64 uploader plugin
 */
export default function base64Uploader() {
  return new Plugin({
    props: {
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData('text/html');
        if (!html?.includes('data:image')) {
          return false;
        }

        // Let the paste complete first
        setTimeout(() => {
          const { tr } = view.state;

          view.state.doc.descendants(async (node, pos) => {
            if (node.type.name === 'image' && node.attrs.src.startsWith('data:image')) {
              const { src } = node.attrs;
              let ext = src.replace('data:image/', '').split(';base64')[0];
              if (ext === 'jpeg') ext = 'jpg';

              const { parent, name } = getPathDetails();
              const path = `${parent}/${name}-wp${makeHash(src)}.${ext}`;
              const fpoSrc = `${FPO_IMG_URL}#${CON_ORIGIN}${path}`;

              tr.setNodeMarkup(pos, null, { ...node.attrs, src: fpoSrc });

              const resp = await fetch(src);
              const blob = await resp.blob();
              const body = new FormData();
              body.append('data', blob);
              await daFetch(`${DA_ORIGIN}/source${path}`, { body, method: 'POST' });

              replaceWordImage(fpoSrc);
            }
          });

          if (tr.docChanged) {
            view.dispatch(tr);
          }
        }, 0);

        return false; // Let other plugins handle the paste
      },
    },
  });
}
