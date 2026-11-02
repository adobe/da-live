import { Fragment, TextSelection } from 'da-y-wrapper';
import { getNx2 } from '../../../scripts/utils.js';
import { PAYLOAD_KIND } from './payload.js';
import { resolvePlacement, currentInsertPosition } from './placement.js';
import { uploadFile, parseHtml, resolveAssets } from './content.js';

const { updateImageInDocument } = await import(`${getNx2()}/public/utils/quick-edit-images.js`);

const FPO_IMG_URL = '/blocks/edit/img/fpo.svg';

const ERROR_MESSAGES = {
  unavailable: 'The editor is not available. Please try again.',
  unsupported: 'This content cannot be dropped here.',
  'invalid-target': 'This content cannot be dropped here.',
  'stale-target': 'The document changed during the drop. Please try again.',
  'single-image-required': 'Drop a single image to replace this image.',
  'image-too-large': 'Image is too large',
  'upload-failed': 'The image could not be uploaded. Please try again.',
  'not-configured': 'AEM Assets is not configured for this site.',
  'asset-rejected': 'The assets could not be added.',
  'invalid-html': 'The dropped content could not be inserted.',
  'drop-failed': 'The drop failed. Please try again.',
};

const fail = (error, message) => ({ ok: false, error, message: message ?? ERROR_MESSAGES[error] });

function findNodePos(doc, predicate) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found === null && predicate(node)) found = pos;
    return found === null;
  });
  return found;
}

function insertNodes({ view, pos, nodes }) {
  const fragment = Fragment.from(nodes);
  const tr = view.state.tr.insert(pos, fragment);
  const end = Math.min(pos + fragment.size, tr.doc.content.size);
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(end))).scrollIntoView());
}

// Placeholders are inserted before uploading so the drop position stays mapped through
// concurrent edits; each is swapped (or removed) by its unique src afterwards.
async function insertUploads({ view, placement, payload, context, isLive }) {
  const { schema } = view.state;
  const pos = currentInsertPosition(view, placement);
  if (pos === null) return fail('stale-target');
  const srcs = payload.files.map(() => `${FPO_IMG_URL}?drop=${crypto.randomUUID()}`);
  insertNodes({
    view,
    pos,
    nodes: srcs.map((src) => schema.nodes.image.create({ src, style: 'width: 180px' })),
  });
  const results = await Promise.all(payload.files.map(async (file, i) => {
    const result = await uploadFile({ file, context }).catch(() => ({ error: 'upload-failed' }));
    if (view.isDestroyed) return result;
    const at = findNodePos(view.state.doc, (node) => node.attrs?.src === srcs[i]);
    if (at === null) return result;
    const end = at + view.state.doc.nodeAt(at).nodeSize;
    const tr = result.src && isLive()
      ? view.state.tr.replaceWith(at, end, schema.nodes.image.create({ src: result.src }))
      : view.state.tr.delete(at, end);
    view.dispatch(tr);
    return result;
  }));
  const failed = results.find((result) => result.error);
  return failed ? fail(failed.error) : { ok: true };
}

async function replaceWithUpload({ view, placement, payload, context, isLive }) {
  const result = await uploadFile({ file: payload.files[0], context });
  if (result.error) return fail(result.error);
  if (!isLive()) return fail('stale-target');
  updateImageInDocument({ view, target: placement.node, newSrc: result.src });
  return { ok: true, src: result.src };
}

async function dropAssets({ view, placement, payload, context, isLive }) {
  const { schema } = view.state;
  const resolved = await resolveAssets({ schema, assets: payload.assets, context });
  if (resolved.error) return fail(resolved.error, resolved.message);
  if (!isLive()) return fail('stale-target');
  if (placement.type === 'replace') {
    const [node] = resolved.nodes;
    if (resolved.nodes.length !== 1 || node.type.name !== 'image') {
      return fail('single-image-required', resolved.message);
    }
    updateImageInDocument({ view, target: placement.node, newSrc: node.attrs.src });
    return { ok: true, src: node.attrs.src, message: resolved.message };
  }
  const pos = currentInsertPosition(view, placement);
  if (pos === null) return fail('stale-target');
  insertNodes({ view, pos, nodes: resolved.nodes });
  view.focus();
  return { ok: true, message: resolved.message };
}

function insertHtml({ view, placement, payload }) {
  const slice = parseHtml({ schema: view.state.schema, html: payload.html });
  if (!slice) return fail('invalid-html');
  const pos = currentInsertPosition(view, placement);
  if (pos === null) return fail('stale-target');
  view.dispatch(view.state.tr.replaceRange(pos, pos, slice).scrollIntoView());
  return { ok: true };
}

/**
 * The single place every drop ends: extension sessions, the assets rail, and native OS
 * drops in either editor all normalize to `{ payload, target }` and call this.
 *
 * @param {object} opts
 * @param {object} opts.payload DropPayload (see payload.js)
 * @param {object} opts.target DropTarget (see placement.js)
 * @param {import('prosemirror-view').EditorView} opts.view
 * @param {{ org, site, parent?, name? }} opts.context
 * @param {() => boolean} [opts.isLive] re-checked after every await
 * @returns {Promise<{ ok: boolean, error?: string, message?: string, src?: string }>}
 */
export async function performDrop({ payload, target, view, context, isLive = () => true }) {
  const live = () => !!view && !view.isDestroyed && view.editable && isLive();
  if (!payload || !live()) return fail('unavailable');
  const placement = resolvePlacement({ view, target, payload });
  if (placement.error) return fail(placement.error);
  const opts = { view, placement, payload, context, isLive: live };
  try {
    if (payload.kind === PAYLOAD_KIND.HTML) return insertHtml(opts);
    if (payload.kind === PAYLOAD_KIND.ASSETS) return await dropAssets(opts);
    if (payload.kind === PAYLOAD_KIND.FILES) {
      return placement.type === 'replace' ? await replaceWithUpload(opts) : await insertUploads(opts);
    }
    return fail('unsupported');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[drop]', e);
    return fail('drop-failed');
  }
}

/** Toasts a result's message; `image-too-large` is already toasted at upload time. */
export async function notifyDropResult(result) {
  if (!result?.message || result.error === 'image-too-large') return;
  try {
    const { showToast, VARIANT_ERROR } = await import(`${getNx2()}/blocks/shared/toast/toast.js`);
    showToast({ text: result.message, variant: VARIANT_ERROR });
  } catch { /* a broken toast module must not reject */ }
}
