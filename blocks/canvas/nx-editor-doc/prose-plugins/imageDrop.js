import { Plugin, TextSelection } from 'da-y-wrapper';
import { daFetch } from '../../../shared/utils.js';
import { getSourceUploadContext } from './sourceUploadContext.js';

const FPO_IMG_URL = 'https://da.live/blocks/edit/img/fpo.svg';
const SUPPORTED_FILES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif'];

/**
 * @param {import('prosemirror-model').Schema} schema
 * @param {() => string | null} getSourceUrl
 */
export default function imageDrop(schema, getSourceUrl) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        drop: (view, event) => {
          event.preventDefault();

          const { files } = event.dataTransfer;
          if (files.length === 0) return false;

          const details = getSourceUploadContext(getSourceUrl() ?? '');
          if (!details) return false;

          ([...files]).forEach(async (file) => {
            if (!SUPPORTED_FILES.some((type) => type === file.type)) return;

            const fpo = schema.nodes.image.create({ src: FPO_IMG_URL, style: 'width: 180px' });
            view.dispatch(view.state.tr.replaceSelectionWith(fpo).scrollIntoView());

            const { $from } = view.state.selection;

            const url = `${details.origin}/source${details.parent}/.${details.name}/${file.name}`;

            const formData = new FormData();
            formData.append('data', file);
            const opts = { method: 'PUT', body: formData };
            const resp = await daFetch(url, opts);
            if (!resp.ok) return;
            const json = await resp.json();

            const docImg = document.createElement('img');
            docImg.addEventListener('load', () => {
              const fpoSelection = TextSelection.create(view.state.doc, $from.pos - 1, $from.pos);
              const ts = view.state.tr.setSelection(fpoSelection);
              const img = schema.nodes.image.create({ src: json.source.contentUrl });
              const tr = ts.replaceSelectionWith(img).scrollIntoView();
              view.dispatch(tr);
            });
            docImg.src = json.source.contentUrl;
          });
          return true;
        },
      },
    },
  });
}
