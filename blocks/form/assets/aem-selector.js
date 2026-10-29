import { getNx2 } from '../../../scripts/utils.js';
import { CANCELLED, SOURCE_LABELS } from './sources.js';

/** The base URL nx2 modules are loaded from. */
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
  // Defines `nx-dialog`, which hosts the selector.
  import(`${nx2}/blocks/shared/dialog/dialog.js`),
]);

/** The stylesheet of the dialog, loaded into the document because the dialog lives there. */
const STYLE_HREF = new URL('./aem-selector.css', import.meta.url).href;

/** The class of the dialog that hosts the selector. */
const DIALOG_CLASS = 'aem-selector-dialog';

/** The class of the container the selector renders into. */
const SELECTOR_CLASS = 'aem-selector';

/** The errors a selection from AEM Assets reports to the author. */
const AEM_ERRORS = {
  signIn: 'Sign in to select a file from AEM Assets.',
  unavailable: 'The AEM Assets selector could not be loaded.',
  notImage: 'Only images can be selected here.',
};

/**
 * Reads the IMS access token and starts the sign-in redirect for anonymous users. The
 * user asked for AEM Assets, so a redirect is expected here.
 * @returns {Promise<string|undefined>} The access token, or undefined when signed out.
 */
async function getTokenOrSignIn() {
  const ims = await loadIms();
  if (ims?.anonymous) {
    handleSignIn();
  }
  return ims?.accessToken?.token;
}

/**
 * Percent-encodes an AEM URL for storage. AEM URLs keep the asset path as named, spaces
 * included, but stored asset values must not contain whitespace. Characters that are
 * already encoded stay as they are.
 * @param {string} href The AEM URL.
 * @returns {string} The encoded URL, or the input when it is not a valid URL.
 */
function toStorableHref(href) {
  try {
    return new URL(href).href;
  } catch {
    return href;
  }
}

/**
 * Turns the asset the user picked into a field result.
 * @param {object} options The selection to convert.
 * @param {object} [options.asset] The picked asset, undefined when nothing was picked.
 * @param {object} options.repositoryConfig The site's AEM Assets repository configuration.
 * @param {boolean} options.imagesOnly Whether the field accepts only images.
 * @returns {object} The `href`, `name` and `alt` of the asset, an `error`, or `CANCELLED`.
 */
function toAssetResult({ asset, repositoryConfig, imagesOnly }) {
  if (!asset) {
    return CANCELLED;
  }

  const { href, alt, isImage, error } = resolveAssetSelection({
    asset,
    repoConfig: repositoryConfig,
  });
  if (error) {
    return { error };
  }
  if (imagesOnly && !isImage) {
    return { error: AEM_ERRORS.notImage };
  }

  const name = asset['repo:name'] ?? asset.name;
  return { href: toStorableHref(href), name, alt };
}

/**
 * Opens the dialog the selector renders into. The hosted selector renders outside shadow
 * roots, so the dialog lives in the document body.
 * @returns {{ dialog: HTMLElement, container: HTMLElement }} The dialog and the selector's
 *   container inside it.
 */
function openSelectorDialog() {
  const dialog = document.createElement('nx-dialog');
  dialog.className = DIALOG_CLASS;
  dialog.title = SOURCE_LABELS.aemAssets;
  const container = document.createElement('div');
  container.className = SELECTOR_CLASS;
  dialog.append(container);
  document.body.append(dialog);
  return { dialog, container };
}

/**
 * Renders the selector into the dialog and waits until the user picks an asset or closes
 * the dialog.
 * @param {object} options The selector and its request.
 * @param {object} options.selectors The loaded AEM Assets selectors library.
 * @param {{ dialog: HTMLElement, container: HTMLElement }} options.dialogElements The open
 *   dialog and the selector's container inside it.
 * @param {object} options.request The selection request.
 * @param {string} options.request.imsToken The IMS access token.
 * @param {object} options.request.repositoryConfig The site's AEM Assets repository
 *   configuration.
 * @param {boolean} options.request.imagesOnly Whether the field accepts only images.
 * @returns {Promise<object>} The field result, see `toAssetResult`.
 */
function waitForSelection({ selectors, dialogElements, request }) {
  const { imsToken, repositoryConfig, imagesOnly } = request;
  return new Promise((resolve) => {
    /** Settles the selection as cancelled when the user closes the dialog or selector. */
    const cancel = () => resolve(CANCELLED);
    dialogElements.dialog.addEventListener('close', cancel, { once: true });
    selectors.renderAssetSelector(dialogElements.container, buildAssetSelectorProps({
      imsToken,
      repoConfig: repositoryConfig,
      filterSchema: imagesOnly ? createImagesOnlyFilterSchema() : undefined,
      onClose: cancel,
      handleSelection: ([asset] = []) => {
        resolve(toAssetResult({ asset, repositoryConfig, imagesOnly }));
      },
    }));
  });
}

/**
 * Lets the user pick an asset in the AEM Assets selector, shown in a dialog.
 * @param {object} options The selector settings.
 * @param {object} options.repositoryConfig The site's AEM Assets repository configuration.
 * @param {boolean} [options.imagesOnly] Whether the field accepts only images.
 * @param {Function} [options.loadSelector] Loads the selectors library.
 * @returns {Promise<object>} The `href`, `name` and `alt` of the picked asset, an `error`,
 *   or `CANCELLED` when the user closed the dialog.
 */
export async function selectAemAsset({
  repositoryConfig,
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

  const dialogElements = openSelectorDialog();
  const request = { imsToken, repositoryConfig, imagesOnly };
  try {
    return await waitForSelection({ selectors, dialogElements, request });
  } finally {
    dialogElements.dialog.remove();
  }
}
