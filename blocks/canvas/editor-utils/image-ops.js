/* eslint-disable import/no-unresolved -- importmap */
import { NodeSelection } from 'da-y-wrapper';
import { daFetch } from '../../shared/utils.js';
import { getSourceUploadContext } from '../ew-editor-doc/prose-plugins/sourceUploadContext.js';

/** MIME types accepted by the DA upload endpoint for image replace/insert. */
export const SUPPORTED_IMAGE_TYPES = [
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
];

/**
 * Returns `{ node, pos }` when an `image` NodeSelection is active, else `null`.
 * @param {import('prosemirror-state').EditorState} state
 */
export function getSelectedImage(state) {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return null;
  if (selection.node?.type?.name !== 'image') return null;
  return { node: selection.node, pos: selection.from };
}

/**
 * Replace the `src` (and optionally other attrs) of the image at `pos`,
 * preserving every attribute the caller does not override (alt, title, href,
 * focal point, sizing style, …).
 * @returns {boolean} true if a node was updated.
 */
export function updateImageAttrs(view, pos, attrs) {
  if (!view) return false;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'image') return false;
  const tr = view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, ...attrs });
  view.dispatch(tr);
  return true;
}

/**
 * Derive a human-readable fallback alt from an uploaded filename.
 * "my-cool-photo.png" → "My cool photo".
 */
export function altFromFilename(filename) {
  if (!filename) return '';
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!stem) return '';
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/**
 * Upload an image file to the DA admin source endpoint and return the public
 * delivery URL. Mirrors the upload pipeline used by `imageDrop` so that all
 * "replace from local file" flows share one code path.
 *
 * @param {{ file: File, sourceUrl: string }} args
 * @returns {Promise<{ src: string } | null>} returns `null` when the upload
 *   target cannot be derived (non-DA source) or the request fails.
 */
export async function uploadImageToDa({ file, sourceUrl }) {
  if (!file) return null;
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) return null;
  const details = getSourceUploadContext(sourceUrl ?? '');
  if (!details) return null;

  const safeName = encodeURIComponent(file.name);
  const url = `${details.origin}/source${details.parent}/.${details.name}/${safeName}`;
  const formData = new FormData();
  formData.append('data', file);
  const resp = await daFetch(url, { method: 'PUT', body: formData });
  if (!resp.ok) return null;
  const json = await resp.json().catch(() => null);
  const src = json?.source?.contentUrl;
  if (!src) return null;
  return { src };
}
