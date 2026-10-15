import { getNx, getNx2 } from '../../../scripts/utils.js';
import getPathDetails from '../../shared/pathDetails.js';
import { createImageNode, getBlockName, insertFragment, insertImage, insertLink } from './helpers/insert.js';
import showSmartCropDialog from './helpers/smart-crop.js';

const nx2 = getNx2();
const [
  { getRepositoryConfig, getResponsiveImageConfig },
  { buildAssetSelectorProps, rememberAssetFolder },
  { applySiteImageModifiers },
  { MISSING_FORMAT_ERROR_MSG, resolveAssetSelection },
  { ASSET_SELECTOR_URL },
] = await Promise.all([
  import(`${nx2}/utils/aem-assets/repository-config.js`),
  import(`${nx2}/utils/aem-assets/selector-props.js`),
  import(`${nx2}/utils/aem-assets/image-modifiers.js`),
  import(`${nx2}/utils/aem-assets/selection.js`),
  import(`${nx2}/utils/aem-assets/selector.js`),
]);

export function formatExternalBrief(doc) {
  let title = '';
  doc.descendants((node) => {
    if (node.type.name === 'heading' && node.attrs.level === 1 && !title) {
      title = node.textContent;
    }
    return !title;
  });

  const contentPlainText = doc.textContent;
  if (!contentPlainText) return '';

  return `The user is looking for assets that match a web page with the following content:

  ${title ? `Title: ${title}` : ''}

  ${contentPlainText}

  Please suggest Assets that are visually appealing and relevant to the subject.`;
}

function showErrorPanel(container, onBack, onCancel, message) {
  container.innerHTML = `<p class="da-dialog-asset-error">${message}</p><div class="da-dialog-asset-buttons"><button class="back">Back</button><button class="cancel">Cancel</button></div>`;
  container.querySelector('.cancel').addEventListener('click', onCancel);
  container.querySelector('.back').addEventListener('click', onBack);
}

export function createDialogPanels() {
  const assetPanel = document.createElement('div');
  assetPanel.className = 'da-dialog-asset-inner';

  const secondaryPanel = document.createElement('div');
  secondaryPanel.style.display = 'none';
  secondaryPanel.className = 'da-dialog-asset-inner';

  return { assetPanel, secondaryPanel };
}

function showSecondaryPanel(assetPanel, secondaryPanel) {
  assetPanel.style.display = 'none';
  secondaryPanel.style.display = 'block';
}

function showAssetPanel(assetPanel, secondaryPanel) {
  secondaryPanel.style.display = 'none';
  secondaryPanel.innerHTML = '';
  assetPanel.style.display = 'block';
}

/**
 * Builds the asset selector's `handleSelection` callback. Shared by the classic editor
 * (blocks/edit) and the canvas editor (blocks/canvas) — the two only differ in how they
 * resolve the editor view and how they close the surrounding UI, so those are injected:
 *
 * @param {object} opts
 * @param {HTMLElement} opts.assetPanel - Panel hosting the asset selector.
 * @param {HTMLElement} opts.secondaryPanel - Panel used for smart-crop / error UI.
 * @param {object} opts.repoConfig - Resolved repository config (see getRepositoryConfig).
 * @param {Promise<Array|false>} opts.responsiveImageConfigPromise - Responsive image configs.
 * @param {function(): object} opts.getView - Returns the current ProseMirror view.
 * @param {function(): void} opts.close - Closes the surrounding dialog/panel.
 * @returns {function(Array): Promise<void>}
 */
export function buildHandleSelection({
  assetPanel,
  secondaryPanel,
  repoConfig,
  responsiveImageConfigPromise,
  getView,
  close,
}) {
  return async (assets) => {
    const [asset] = assets;
    if (!asset) return;

    const view = getView();
    if (!view) return;

    const selection = resolveAssetSelection({ asset, repoConfig });
    if (selection.error === MISSING_FORMAT_ERROR_MSG) return;

    rememberAssetFolder(repoConfig, asset.path);

    const resetToAssetPanel = () => showAssetPanel(assetPanel, secondaryPanel);
    const closeAndReset = () => {
      close();
      resetToAssetPanel();
    };

    if (selection.error) {
      showSecondaryPanel(assetPanel, secondaryPanel);
      showErrorPanel(secondaryPanel, resetToAssetPanel, closeAndReset, selection.error);
      return;
    }

    const { href, isImage, alt } = selection;

    // Smart crop flow (only for images with smart crop enabled)
    if (isImage && repoConfig.isSmartCrop) {
      showSecondaryPanel(assetPanel, secondaryPanel);

      const hasCrops = await showSmartCropDialog({
        container: secondaryPanel,
        asset,
        assetUrl: href,
        dmOrigin: repoConfig.assetOrigin,
        dmBasePath: repoConfig.assetBasePath,
        blockName: getBlockName(view),
        responsiveImageConfigPromise,
        onInsert: (srcs) => {
          closeAndReset();
          const nodes = srcs.map((src) => createImageNode(
            view,
            applySiteImageModifiers(src, repoConfig.siteImageModifiers),
            alt,
          ));
          insertFragment(view, nodes);
        },
        onBack: resetToAssetPanel,
        onCancel: closeAndReset,
      });

      if (!hasCrops) {
        closeAndReset();
        insertImage(view, href, alt);
      }
      return;
    }

    // Standard insertion
    close();

    if (!isImage || repoConfig.insertAsLink) {
      insertLink(view, href);
    } else {
      insertImage(view, href, alt);
    }
  };
}

export async function openAssets() {
  const nx = getNx();
  const isNx2 = nx.endsWith('/nx2');
  const { loadStyle } = await import(`${nx}/utils/utils.js`);
  // TODO: remove the ternary and the nx v1 branch once nxver=2 is
  // rolled out on the CDN. Kept for backward compat during the
  // transition: nx v1 exposes loadScript at utils/script.js; nx2
  // re-exports it from utils/utils.js.
  const loadScript = isNx2
    ? (await import(`${nx}/utils/utils.js`)).loadScript
    : (await import(`${nx}/utils/script.js`)).default;
  const { loadIms, handleSignIn } = await import(`${nx}/utils/ims.js`);

  const details = await loadIms();
  if (details.anonymous) handleSignIn();
  if (!details.accessToken) return;

  const { owner, repo } = getPathDetails();
  const repoConfig = await getRepositoryConfig(owner, repo);
  if (!repoConfig) return;

  let dialog = document.querySelector('.da-dialog-asset');
  if (dialog) {
    dialog.showModal();
    return;
  }

  const assetSheet = await loadStyle(import.meta.url);
  if (assetSheet && !document.adoptedStyleSheets.includes(assetSheet)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, assetSheet];
  }
  await loadScript(ASSET_SELECTOR_URL);

  dialog = document.createElement('dialog');
  dialog.className = 'da-dialog-asset';

  const { assetPanel, secondaryPanel } = createDialogPanels();
  dialog.append(assetPanel, secondaryPanel);

  document.body.querySelector('main').insertAdjacentElement('afterend', dialog);
  dialog.showModal();

  const responsiveImageConfigPromise = getResponsiveImageConfig(owner, repo);
  const externalBrief = formatExternalBrief(window.view.state.doc);

  const selectorProps = buildAssetSelectorProps({
    imsToken: details.accessToken.token,
    repoConfig,
    externalBrief,
    onClose: () => assetPanel.style.display !== 'none' && dialog.close(),
    handleSelection: buildHandleSelection({
      assetPanel,
      secondaryPanel,
      repoConfig,
      responsiveImageConfigPromise,
      getView: () => window.view,
      close: () => dialog.close(),
    }),
  });

  window.PureJSSelectors.renderAssetSelector(assetPanel, selectorProps);
}
