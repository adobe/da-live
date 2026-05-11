// eslint-disable-next-line import/no-unresolved
import { Plugin, PluginKey } from 'da-y-wrapper';
import getPathDetails from '../../../shared/pathDetails.js';
import { daFetch } from '../../../shared/utils.js';

const imageDropKey = new PluginKey('imageDrop');

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';
export const SUPPORTED_IMAGE_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif'];

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

export async function uploadImageFile(view, file) {
  if (!SUPPORTED_IMAGE_TYPES.some((type) => type === file.type)) return;

  const { schema } = view.state;
  const details = getPathDetails();
  const url = `${details.origin}/media${details.parent}/${file.name}`;

  // Use the upload URL as a unique FPO identifier so concurrent uploads can
  // each find their own placeholder by content rather than by stale position.
  const fpoSrc = `${FPO_IMG_URL}#${url}`;
  const fpo = schema.nodes.image.create({ src: fpoSrc, style: 'width: 180px' });
  view.dispatch(view.state.tr.replaceSelectionWith(fpo).scrollIntoView());

  const formData = new FormData();
  formData.append('data', file);
  const opts = { method: 'POST', body: formData };
  const resp = await daFetch(url, opts);
  if (!resp.ok) {
    let removed = false;
    view.state.doc.descendants((node, pos) => {
      if (!removed && node.type.name === 'image' && node.attrs.src === fpoSrc) {
        removed = true;
        view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
      }
    });

    if (resp.status === 413) {
      renderError('Image size exceeds 20MB limit');
    } else {
      const json = await resp.json();
      if (json.error) {
        renderError(`Failed to upload image: ${json.error}`);
      } else {
        renderError(`Failed to upload image: ${json.message}`);
      }
    }
    return;
  }
  const json = await resp.json();

  // Create a doc image to pre-download the image before showing it.
  const docImg = document.createElement('img');
  docImg.addEventListener('load', () => {
    // Find the placeholder by its unique src rather than a stale position so
    // concurrent uploads and collab updates cannot cause the wrong node to be
    // replaced.
    let replaced = false;
    view.state.doc.descendants((node, pos) => {
      if (!replaced && node.type.name === 'image' && node.attrs.src === fpoSrc) {
        replaced = true;
        const img = schema.nodes.image.create({ src: json.uri });
        view.dispatch(view.state.tr.replaceWith(pos, pos + node.nodeSize, img).scrollIntoView());
      }
    });
  });
  docImg.src = json.uri;
}

export default function imageDrop() {
  return new Plugin({
    key: imageDropKey,
    props: {
      handleDOMEvents: {
        drop: (view, event) => {
          event.preventDefault();

          const { files } = event.dataTransfer;
          if (files.length === 0) return;

          ([...files]).forEach((file) => {
            uploadImageFile(view, file);
          });
        },
      },
    },
  });
}
