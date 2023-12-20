import { Plugin, TextSelection } from 'prosemirror-state';
import getPathDetails from '../../../shared/pathDetails.js';

const FPO_IMG_URL = 'https://content.da.live/auniverseaway/da/assets/fpo.svg';
const SUPPORTED_FILES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif'];

export default function imageDrop(schema) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        drop: (view, event) => {
          event.preventDefault();

          const { files } = event.dataTransfer;
          if (files.length === 0) return;

          ([...files]).forEach(async (file) => {
            if (!SUPPORTED_FILES.some((type) => type === file.type)) return;

            const fpo = schema.nodes.image.create({ src: FPO_IMG_URL, style: 'width: 180px' });
            view.dispatch(view.state.tr.replaceSelectionWith(fpo).scrollIntoView());

            const { $from } = view.state.selection;

            const details = getPathDetails();
            const url = `${details.origin}/source${details.parent}/${file.name}`;

            const formData = new FormData();
            formData.append('data', file);
            const opts = { method: 'PUT', body: formData };
            const resp = await fetch(url, opts);
            if (!resp.ok) return;
            const json = await resp.json();

            // Create a doc image to pre-download the image before showing it.
            const docImg = document.createElement('img');
            docImg.addEventListener('load', (e) => {
              const fpoSelection = TextSelection.create(view.state.doc, $from.pos - 1, $from.pos);
              const ts = view.state.tr.setSelection(fpoSelection);
              const img = schema.nodes.image.create({ src: json.source.contentUrl });
              const tr = ts.replaceSelectionWith(img).scrollIntoView();
              view.dispatch(tr);
            });
            docImg.src = json.source.contentUrl;
          });
        }
      }
    }
  });
}
