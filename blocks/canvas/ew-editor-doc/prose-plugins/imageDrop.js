import { Plugin, TextSelection } from 'da-y-wrapper';
import { daFetch } from '../../../shared/utils.js';
import { getSourceUploadContext } from './sourceUploadContext.js';
import { altFromFilename, SUPPORTED_IMAGE_TYPES } from '../../editor-utils/image-ops.js';

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';

/**
 * If `event.clientX/Y` falls inside an existing `image` node, return its
 * document position. Used to decide whether a drop should *replace* that
 * image instead of inserting a new one.
 */
function imageNodePosAtPoint(view, event) {
  const coords = { left: event.clientX, top: event.clientY };
  const hit = view.posAtCoords(coords);
  if (!hit) return null;
  const $pos = view.state.doc.resolve(hit.pos);
  // `nodeAfter` covers the click-on-image case in inline content; fall back
  // to the parent walk for clicks on padding around the image element.
  const candidate = $pos.nodeAfter ?? view.state.doc.nodeAt(Math.max(0, hit.pos - 1));
  if (candidate?.type?.name === 'image') {
    return $pos.nodeAfter ? hit.pos : Math.max(0, hit.pos - 1);
  }
  return null;
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
          const { files } = event.dataTransfer;
          if (files.length === 0) return false;

          const details = getSourceUploadContext(getSourceUrl() ?? '');
          if (!details) return false;

          event.preventDefault();

          const replacePos = imageNodePosAtPoint(view, event);

          ([...files]).forEach(async (file) => {
            if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) return;

            // Use encoded filename to defang special chars and prevent simple
            // path-traversal attempts via OS filenames.
            const safeName = encodeURIComponent(file.name);
            const url = `${details.origin}/source${details.parent}/.${details.name}/${safeName}`;

            // Replace-in-place: keep the existing image's alt/title/href/focal/
            // sizing, swap only `src`. Don't insert an FPO placeholder — the
            // existing image stays put until the upload completes.
            if (replacePos !== null) {
              const existing = view.state.doc.nodeAt(replacePos);
              if (!existing || existing.type.name !== 'image') return;

              const formData = new FormData();
              formData.append('data', file);
              const resp = await daFetch(url, { method: 'PUT', body: formData });
              if (!resp.ok) return;
              const json = await resp.json().catch(() => null);
              const newSrc = json?.source?.contentUrl;
              if (!newSrc) return;

              const current = view.state.doc.nodeAt(replacePos);
              if (!current || current.type.name !== 'image') return;
              const altOverride = current.attrs.alt
                ? {}
                : { alt: altFromFilename(file.name) };
              view.dispatch(
                view.state.tr.setNodeMarkup(replacePos, null, {
                  ...current.attrs,
                  src: newSrc,
                  ...altOverride,
                }),
              );
              return;
            }

            // Insert path (no existing image at the drop point).
            const fpo = schema.nodes.image.create({ src: FPO_IMG_URL, style: 'width: 180px' });
            view.dispatch(view.state.tr.replaceSelectionWith(fpo).scrollIntoView());

            const { $from } = view.state.selection;

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
