import { Plugin, TextSelection } from 'da-y-wrapper';
import { daFetch } from '../../../shared/utils.js';
import { getSourceUploadContext } from './sourceUploadContext.js';

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';
export const SUPPORTED_IMAGE_FILES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif'];

export async function uploadImageFile(view, file, details) {
  if (!SUPPORTED_IMAGE_FILES.some((type) => type === file.type)) return;

  const { schema } = view.state;
  const fpo = schema.nodes.image.create({ src: FPO_IMG_URL, style: 'width: 180px' });
  view.dispatch(view.state.tr.replaceSelectionWith(fpo).scrollIntoView());

  const { $from } = view.state.selection;
  const url = `${details.origin}/source${details.parent}/.${details.name}/${file.name}`;

  const formData = new FormData();
  formData.append('data', file);
  const resp = await daFetch(url, { method: 'PUT', body: formData });
  if (!resp.ok) return;
  const json = await resp.json();

  const docImg = document.createElement('img');
  docImg.addEventListener('load', () => {
    const fpoSelection = TextSelection.create(view.state.doc, $from.pos - 1, $from.pos);
    const ts = view.state.tr.setSelection(fpoSelection);
    const img = schema.nodes.image.create({ src: json.source.contentUrl });
    view.dispatch(ts.replaceSelectionWith(img).scrollIntoView());
  });
  docImg.src = json.source.contentUrl;
}

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
            await uploadImageFile(view, file, details);
          });
          return true;
        },
      },
    },
  });
}
