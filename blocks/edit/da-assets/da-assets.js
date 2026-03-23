import { getNx } from '../../../scripts/utils.js';
import getPathDetails from '../../shared/pathDetails.js';
import { getRepositoryConfig, getResponsiveImageConfig } from './helpers/config.js';
import {
  buildAuthorUrl, buildDmUrl, buildDeliveryUrl,
  getAssetAlt, getDmApprovalStatus, getScene7PublishStatus,
} from './helpers/urls.js';
import { insertImage, insertLink, insertFragment, createImageNode, getBlockName } from './helpers/insert.js';
import showSmartCropDialog from './helpers/smart-crop.js';

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/static-assets/resources/assets-selectors.js';

const DM_ERROR_MSG = 'The selected asset is not available because it is not approved for delivery. Please check the status.';
const PUBLISH_ERROR_MSG = 'The selected asset is not available on the publish tier. Please publish the asset in AEM and try again.';

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

export function buildFeatureSet(isDmEnabled) {
  const features = ['upload', 'collections', 'detail-panel', 'advisor'];
  if (isDmEnabled) features.push('dynamic-media');
  return features;
}

export function resolveAssetUrl(asset, repoConfig) {
  const { tierType, assetOrigin, assetBasePath, isDmEnabled, mimeRenditionOverrides } = repoConfig;
  const renditionOptions = { mimeRenditionOverrides };
  if (tierType === 'delivery') {
    return buildDeliveryUrl(asset, assetOrigin, assetBasePath, renditionOptions);
  }
  if (isDmEnabled) {
    return buildDmUrl(asset, assetOrigin, assetBasePath, renditionOptions);
  }
  return buildAuthorUrl(asset, assetOrigin);
}

function showErrorPanel(container, onBack, onCancel, message = DM_ERROR_MSG) {
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

export function buildHandleSelection(
  dialog,
  assetPanel,
  secondaryPanel,
  repoConfig,
  responsiveImageConfigPromise,
) {
  return async (assets) => {
    const [asset] = assets;
    if (!asset) return;

    const format = asset['aem:formatName'];
    if (!format) return;

    const mimetype = asset.mimetype || asset['dc:format'] || '';
    const isImage = mimetype.toLowerCase().startsWith('image/');
    const alt = getAssetAlt(asset);
    const { view } = window;

    const resetToAssetPanel = () => showAssetPanel(assetPanel, secondaryPanel);
    const closeAndReset = () => { dialog.close(); resetToAssetPanel(); };

    // Author+DM mode: check asset is approved for delivery before inserting
    if (repoConfig.tierType === 'author' && repoConfig.isDmEnabled) {
      const { status, activationTarget } = getDmApprovalStatus(asset);
      if (activationTarget !== 'delivery' || status !== 'approved') {
        showSecondaryPanel(assetPanel, secondaryPanel);
        showErrorPanel(secondaryPanel, resetToAssetPanel, closeAndReset);
        return;
      }
    }

    // Author+Publish mode: check asset is published to the publish tier
    if (repoConfig.tierType === 'author' && !repoConfig.isDmEnabled) {
      const scene7Status = getScene7PublishStatus(asset);
      if (scene7Status && scene7Status !== 'PublishComplete') {
        showSecondaryPanel(assetPanel, secondaryPanel);
        showErrorPanel(secondaryPanel, resetToAssetPanel, closeAndReset, PUBLISH_ERROR_MSG);
        return;
      }
    }

    // Smart crop flow (only for images with smart crop enabled)
    if (isImage && repoConfig.isSmartCrop) {
      const assetUrl = resolveAssetUrl(asset, repoConfig);
      showSecondaryPanel(assetPanel, secondaryPanel);

      const hasCrops = await showSmartCropDialog({
        container: secondaryPanel,
        asset,
        assetUrl,
        dmOrigin: repoConfig.assetOrigin,
        dmBasePath: repoConfig.assetBasePath,
        blockName: getBlockName(view),
        responsiveImageConfigPromise,
        onInsert: (srcs) => {
          closeAndReset();
          const nodes = srcs.map((src) => createImageNode(view, src, alt));
          insertFragment(view, nodes);
        },
        onBack: resetToAssetPanel,
        onCancel: closeAndReset,
      });

      if (!hasCrops) {
        closeAndReset();
        insertImage(view, assetUrl, alt);
      }
      return;
    }

    // Standard insertion
    dialog.close();
    const src = resolveAssetUrl(asset, repoConfig);

    if (!isImage || repoConfig.insertAsLink) {
      insertLink(view, src);
    } else {
      insertImage(view, src, alt);
    }
  };
}

export async function openAssets() {
  const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
  const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
  const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

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

  await loadStyle(import.meta.url.replace('.js', '.css'));
  await loadScript(ASSET_SELECTOR_URL);

  dialog = document.createElement('dialog');
  dialog.className = 'da-dialog-asset';

  const { assetPanel, secondaryPanel } = createDialogPanels();
  dialog.append(assetPanel, secondaryPanel);

  document.body.querySelector('main').insertAdjacentElement('afterend', dialog);
  dialog.showModal();

  const responsiveImageConfigPromise = getResponsiveImageConfig(owner, repo);
  const externalBrief = formatExternalBrief(window.view.state.doc);

  const selectorProps = {
    imsToken: details.accessToken.token,
    repositoryId: repoConfig.repositoryId,
    aemTierType: repoConfig.tierType,
    featureSet: buildFeatureSet(repoConfig.isDmEnabled),
    externalBrief,
    onClose: () => assetPanel.style.display !== 'none' && dialog.close(),
    handleSelection: buildHandleSelection(
      dialog,
      assetPanel,
      secondaryPanel,
      repoConfig,
      responsiveImageConfigPromise,
    ),
  };

  window.PureJSSelectors.renderAssetSelector(assetPanel, selectorProps);
}
