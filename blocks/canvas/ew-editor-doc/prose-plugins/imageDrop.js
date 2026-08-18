import { Plugin, TextSelection } from 'da-y-wrapper';
import { getNx2Api } from '../../../../scripts/utils.js';
import { getSourceUploadContext } from './sourceUploadContext.js';
import { refuseOversizedImage } from '../../utils/image-upload.js';

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';
export const SUPPORTED_IMAGE_FILES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif'];

export async function uploadImageFile(view, file, details) {
  if (!SUPPORTED_IMAGE_FILES.some((type) => type === file.type)) return;
  if (await refuseOversizedImage(file.size, details.parent)) return;

  const { schema } = view.state;
  const fpo = schema.nodes.image.create({ src: FPO_IMG_URL, style: 'width: 180px' });
  view.dispatch(view.state.tr.replaceSelectionWith(fpo).scrollIntoView());

  const { $from } = view.state.selection;
  const path = `${details.parent}/.${details.name}/${file.name}`;

  // the media bus is content addressed, so the src is only known from the response
  const { source } = await getNx2Api();
  const resp = await source.uploadMedia(path, { body: file });
  if (!resp.ok) return;
  const { source: { contentUrl } } = await resp.json();

  const replaceFpo = () => {
    const fpoSelection = TextSelection.create(view.state.doc, $from.pos - 1, $from.pos);
    const ts = view.state.tr.setSelection(fpoSelection);
    const img = schema.nodes.image.create({ src: contentUrl });
    view.dispatch(ts.replaceSelectionWith(img).scrollIntoView());
  };

  // a media bus src is relative to the published page and cannot load from here
  if (contentUrl.startsWith('./media_')) {
    replaceFpo();
    return;
  }

  const docImg = document.createElement('img');
  docImg.addEventListener('load', replaceFpo);
  docImg.src = contentUrl;
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
