/*
 * Copyright 2026 Adobe. All rights reserved.
 * Handles dropping AEM assets (dragged out of the AEM Assets rail selector) into the
 * canvas doc editor's ProseMirror view.
 */
import { Fragment } from 'da-y-wrapper';
import { getNx2 } from '../../../../scripts/utils.js';

// Matches da-nx's ASSET_DRAG_DATA_TYPE (nx2/utils/aem-assets/selector-props.js). Hardcoded
// here (rather than imported) so readDroppedAssets can run synchronously in the drop
// handler, before any da-nx module has been loaded.
const ASSET_DRAG_DATA_TYPE = 'collectionviewdata';

export const NOT_CONFIGURED_ERROR = 'AEM Assets is not configured for this site.';

/**
 * @param {DataTransfer} dataTransfer
 * @returns {Array<object> | null} the dropped assets, or null when the drag did not carry
 * any (the type is absent, or the payload is not a JSON array)
 */
export function readDroppedAssets(dataTransfer) {
  if (!dataTransfer?.types?.includes(ASSET_DRAG_DATA_TYPE)) return null;
  try {
    const parsed = JSON.parse(dataTransfer.getData(ASSET_DRAG_DATA_TYPE));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Loaded lazily, and only once, the first time an asset is actually dropped, so editors
// that never drop an asset don't pay for these modules.
let selectionModulePromise;
function loadSelectionModule() {
  selectionModulePromise ??= import(`${getNx2()}/utils/aem-assets/selection.js`);
  return selectionModulePromise;
}

let toastModulePromise;
function loadToastModule() {
  toastModulePromise ??= import(`${getNx2()}/blocks/shared/toast/toast.js`);
  return toastModulePromise;
}

async function toastError(text) {
  try {
    const { showToast, VARIANT_ERROR } = await loadToastModule();
    showToast({ text, variant: VARIANT_ERROR });
  } catch {
    // Swallow: a broken toast module must not itself produce an unhandled rejection.
  }
}

export const DROP_FAILED_ERROR_MSG = 'The assets could not be added. Please try again.';

/**
 * Resolves each dropped asset against the repository config and builds the ProseMirror
 * nodes to insert for it.
 *
 * @param {import('prosemirror-model').Schema} schema
 * @param {Array<object>} assets
 * @param {object} repoConfig
 * @returns {Promise<{ nodes: Array, errors: Array<string>, rejected: number }>}
 */
export async function buildAssetNodes(schema, assets, repoConfig) {
  const { resolveAssetSelection, MISSING_FORMAT_ERROR_MSG } = await loadSelectionModule();

  const nodes = [];
  const errors = [];
  let rejected = 0;

  assets.forEach((asset) => {
    const selection = resolveAssetSelection({ asset, repoConfig });

    if (selection.error === MISSING_FORMAT_ERROR_MSG) return;

    if (selection.error) {
      rejected += 1;
      if (!errors.includes(selection.error)) errors.push(selection.error);
      return;
    }

    const { href, isImage, alt } = selection;
    if (isImage && !repoConfig.insertAsLink) {
      const attrs = { src: href, style: 'width: 180px' };
      if (alt) attrs.alt = alt;
      nodes.push(schema.nodes.image.create(attrs));
    } else {
      nodes.push(schema.text(href, [schema.marks.link.create({ href })]));
    }
  });

  return { nodes, errors, rejected };
}

/**
 * Inserts dropped assets into the view at the dropped position.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @param {object} opts
 * @param {Array<object>} opts.assets
 * @param {{ left: number, top: number }} opts.coords
 * @param {() => Promise<object | null>} opts.getRepoConfig
 * @returns {Promise<number>} the number of nodes inserted
 */
export async function dropAssets(view, { assets, coords, getRepoConfig }) {
  if (!view.editable) return 0;

  try {
    const repoConfig = await getRepoConfig();
    if (!repoConfig) {
      await toastError(NOT_CONFIGURED_ERROR);
      return 0;
    }

    const { nodes, errors, rejected } = await buildAssetNodes(
      view.state.schema,
      assets,
      repoConfig,
    );

    // Computed after all awaits above, so a doc change that arrived while the repo config
    // or asset nodes were resolving (e.g. a collab edit) is reflected in the position.
    const pos = view.posAtCoords(coords)?.pos ?? view.state.selection.from;

    if (nodes.length) {
      const tr = view.state.tr.insert(pos, Fragment.fromArray(nodes)).scrollIntoView();
      view.dispatch(tr);
    }

    if (errors.length) {
      const suffix = rejected > 1 ? ` (${rejected} assets skipped)` : '';
      await toastError(`${errors[0]}${suffix}`);
    }

    return nodes.length;
  } catch {
    await toastError(DROP_FAILED_ERROR_MSG);
    return 0;
  }
}
