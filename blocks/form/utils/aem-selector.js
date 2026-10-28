import { getNx2 } from '../../../scripts/utils.js';
import { CANCELLED } from './assets.js';

const nx2 = getNx2();
const [
  { createImagesOnlyFilterSchema },
  { resolveAssetSelection },
  { buildAssetSelectorProps },
  { loadAssetSelector },
  { handleSignIn, loadIms },
  { loadPageStyle },
] = await Promise.all([
  import(`${nx2}/utils/aem-assets/filter-schema.js`),
  import(`${nx2}/utils/aem-assets/selection.js`),
  import(`${nx2}/utils/aem-assets/selector-props.js`),
  import(`${nx2}/utils/aem-assets/selector.js`),
  import(`${nx2}/utils/ims.js`),
  import(`${nx2}/utils/utils.js`),
  import(`${nx2}/blocks/shared/dialog/dialog.js`),
]);

const STYLE_HREF = new URL('./aem-selector.css', import.meta.url).href;
const DIALOG_TITLE = 'AEM Assets';

const AEM_ERRORS = {
  signIn: 'Sign in to select a file from AEM Assets.',
  unavailable: 'The AEM Assets selector could not be loaded.',
  notImage: 'Only images can be selected here.',
};

// The user asked for AEM Assets, so a sign-in redirect is expected here.
async function getTokenOrSignIn() {
  const ims = await loadIms();
  if (ims?.anonymous) {
    handleSignIn();
  }
  return ims?.accessToken?.token;
}

// AEM URLs keep the asset path as named, spaces included. Stored asset values must not
// contain whitespace, so the URL is percent-encoded. Encoded characters stay as they are.
function toStorableHref(href) {
  try {
    return new URL(href).href;
  } catch {
    return href;
  }
}

function toAssetResult({ asset, repoConfig, imagesOnly }) {
  if (!asset) {
    return CANCELLED;
  }

  const { href, alt, isImage, error } = resolveAssetSelection({ asset, repoConfig });
  if (error) {
    return { error };
  }
  if (imagesOnly && !isImage) {
    return { error: AEM_ERRORS.notImage };
  }

  const name = asset['repo:name'] ?? asset.name;
  return { href: toStorableHref(href), name, alt };
}

// The hosted selector renders outside shadow roots, so its dialog lives in the document body.
function openSelectorDialog() {
  const dialog = document.createElement('nx-dialog');
  dialog.className = 'nx-form-aem-dialog';
  dialog.title = DIALOG_TITLE;
  const container = document.createElement('div');
  container.className = 'nx-form-aem-selector';
  dialog.append(container);
  document.body.append(dialog);
  return { dialog, container };
}

function waitForSelection({ selectors, ui, selection }) {
  const { dialog, container } = ui;
  const { imsToken, repoConfig, imagesOnly } = selection;
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(CANCELLED), { once: true });
    selectors.renderAssetSelector(container, buildAssetSelectorProps({
      imsToken,
      repoConfig,
      filterSchema: imagesOnly ? createImagesOnlyFilterSchema() : undefined,
      onClose: () => resolve(CANCELLED),
      handleSelection: ([asset] = []) => {
        resolve(toAssetResult({ asset, repoConfig, imagesOnly }));
      },
    }));
  });
}

export async function selectAemAsset({
  repoConfig,
  imagesOnly = false,
  loadSelector = loadAssetSelector,
}) {
  const imsToken = await getTokenOrSignIn();
  if (!imsToken) {
    return { error: AEM_ERRORS.signIn };
  }

  const [{ selectors, error }] = await Promise.all([
    loadSelector(),
    loadPageStyle(STYLE_HREF),
  ]);
  if (error) {
    return { error };
  }
  if (typeof selectors?.renderAssetSelector !== 'function') {
    return { error: AEM_ERRORS.unavailable };
  }

  const ui = openSelectorDialog();
  const selection = { imsToken, repoConfig, imagesOnly };
  try {
    return await waitForSelection({ selectors, ui, selection });
  } finally {
    ui.dialog.remove();
  }
}
