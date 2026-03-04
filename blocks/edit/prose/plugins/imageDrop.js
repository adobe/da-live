// eslint-disable-next-line import/no-unresolved
import { Plugin, TextSelection } from 'da-y-wrapper';
import getPathDetails from '../../../shared/pathDetails.js';
import { daFetch } from '../../../shared/utils.js';

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';
const SUPPORTED_FILES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif'];

async function renderError(message) {
  await import('../../../shared/da-dialog/da-dialog.js');
  const dialog = document.createElement('da-dialog');
  dialog.title = 'Error';
  dialog.message = message;
  dialog.action = {
    style: 'accent',
    label: 'OK',
    click: async () => { dialog.close(); },
  };
  const main = document.body.querySelector('main');
  main.insertAdjacentElement('afterend', dialog);
  dialog.showModal();
}

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
            const url = `${details.origin}/media${details.parent}/${file.name}`;

            const formData = new FormData();
            formData.append('data', file);
            const opts = { method: 'POST', body: formData };
            const resp = await daFetch(url, opts);
            if (!resp.ok) {
              const fpoSelection = TextSelection.create(view.state.doc, $from.pos - 1, $from.pos);
              const ts = view.state.tr.setSelection(fpoSelection);
              view.dispatch(ts.deleteSelection().scrollIntoView());

              if (resp.status === 413) {
                renderError('Image size exceeds 20MB limit');
              } else {
                renderError(`Failed to upload image: ${resp.statusText}`);
              }

              return;
            }
            const json = await resp.json();

            // Create a doc image to pre-download the image before showing it.
            const docImg = document.createElement('img');
            docImg.addEventListener('load', () => {
              const fpoSelection = TextSelection.create(view.state.doc, $from.pos - 1, $from.pos);
              const ts = view.state.tr.setSelection(fpoSelection);
              const img = schema.nodes.image.create({ src: json.uri });
              const tr = ts.replaceSelectionWith(img).scrollIntoView();
              view.dispatch(tr);
            });
            docImg.src = json.uri;
          });
        },
      },
    },
  });
}
