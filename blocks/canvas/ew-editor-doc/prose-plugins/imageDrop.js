import { Plugin, TextSelection } from 'da-y-wrapper';
import { getNx2Api } from '../../../../scripts/utils.js';
import { getSourceUploadContext, getSourceOrgSite } from './sourceUploadContext.js';
import { refuseOversizedImage } from '../../utils/image-upload.js';
import { SUPPORTED_IMAGE_TYPES as SUPPORTED_IMAGE_FILES } from '../../../shared/constants.js';
import { fromDataTransfer } from '../../drop/payload.js';
import { performDrop, notifyDropResult } from '../../drop/pipeline.js';

export { SUPPORTED_IMAGE_FILES };

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';

function findPlaceholder(doc, src) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found === null && node.type.name === 'image' && node.attrs.src === src) found = pos;
    return found === null;
  });
  return found;
}

export async function uploadImageFile(view, file, details, { isLive = () => true } = {}) {
  if (!SUPPORTED_IMAGE_FILES.some((type) => type === file.type)) return;
  if (await refuseOversizedImage(file.size, details.parent)) return;
  if (!isLive()) return;

  const { schema } = view.state;
  const placeholderSrc = `${FPO_IMG_URL}?upload=${crypto.randomUUID()}`;
  const fpo = schema.nodes.image.create({ src: placeholderSrc, style: 'width: 180px' });
  view.dispatch(view.state.tr.replaceSelectionWith(fpo).scrollIntoView());

  const removeFpo = () => {
    if (view.isDestroyed) return;
    const pos = findPlaceholder(view.state.doc, placeholderSrc);
    if (pos === null) return;
    view.dispatch(view.state.tr.delete(pos, pos + 1));
  };
  const path = `${details.parent}/.${details.name}/${file.name}`;

  let contentUrl;
  try {
    // the media bus is content addressed, so the src is only known from the response
    const { source } = await getNx2Api();
    const resp = await source.uploadMedia(path, { body: file });
    if (!resp.ok) {
      if (!isLive()) removeFpo();
      return;
    }
    ({ source: { contentUrl } } = await resp.json());
  } catch (e) {
    if (!isLive()) removeFpo();
    throw e;
  }
  if (!isLive()) {
    removeFpo();
    return;
  }

  const replaceFpo = () => {
    if (!isLive()) {
      removeFpo();
      return;
    }
    if (view.isDestroyed) return;
    const pos = findPlaceholder(view.state.doc, placeholderSrc);
    if (pos === null) return;
    const fpoSelection = TextSelection.create(view.state.doc, pos, pos + 1);
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
  docImg.addEventListener('error', () => {
    if (!isLive()) removeFpo();
  });
  docImg.src = contentUrl;
}

const isExternalDrag = (view, event) => !view.dragging && !!event.dataTransfer;

/**
 * Native drops from outside the browser. Only image files are accepted; other external
 * content is refused. Extension and assets rail drops never reach this plugin: their
 * session overlay sits above the editor and calls the drop pipeline directly.
 * @param {import('prosemirror-model').Schema} schema
 * @param {() => string | null} getSourceUrl
 */
export default function imageDrop(schema, getSourceUrl) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        dragover: (view, event) => {
          if (!isExternalDrag(view, event)) return false;
          event.preventDefault();
          const accepted = view.editable && event.dataTransfer.types.includes('Files');
          event.dataTransfer.dropEffect = accepted ? 'copy' : 'none';
          return true;
        },
        drop: (view, event) => {
          if (!isExternalDrag(view, event)) return false;
          event.preventDefault();
          const payload = view.editable && fromDataTransfer(event.dataTransfer);
          const url = getSourceUrl() ?? '';
          const upload = getSourceUploadContext(url);
          const orgSite = getSourceOrgSite(url);
          if (!payload || !upload || !orgSite) return true;
          const coords = { left: event.clientX, top: event.clientY };
          const pos = view.posAtCoords(coords)?.pos ?? view.state.selection.from;
          performDrop({
            payload,
            target: { editor: 'doc', pos, doc: view.state.doc, coords },
            view,
            context: { ...orgSite, ...upload },
          }).then(notifyDropResult);
          return true;
        },
      },
    },
  });
}
