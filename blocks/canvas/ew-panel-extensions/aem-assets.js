import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import {
  ASSET_SELECTOR_URL,
  buildHandleSelection,
  createDialogPanels,
} from '../../edit/da-assets/da-assets.js';

const { getRepositoryConfig, getResponsiveImageConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`);
const { buildAssetSelectorProps } = await import(`${getNx2()}/utils/aem-assets/selector-props.js`);

// Re-exported for ew-selection-toolbar's "does this site have AEM assets?" check.
// The picker shares Nexter's config resolver with the classic editor.
export { getRepositoryConfig };

// ---------------------------------------------------------------------------
// Script loader
// ---------------------------------------------------------------------------

let selectorScriptLoaded;

function loadSelectorScript() {
  selectorScriptLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ASSET_SELECTOR_URL;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  return selectorScriptLoaded;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Renders the AEM asset selector into `container`; selections insert into the editor. */
export async function renderAssets({ container, org, site, onClose }) {
  const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
  const ims = await loadIms();
  if (ims?.anonymous) handleSignIn();
  const token = ims?.accessToken?.token;
  if (!token) return;

  const repoConfig = await getRepositoryConfig(org, site);
  if (!repoConfig) return;

  await loadSelectorScript();

  // The panel is rendered inside a shadow root, so link the shared asset-picker
  // styles (blocks/edit/da-assets/da-assets.css) that style the smart-crop / error UI.
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = new URL('../../edit/da-assets/da-assets.css', import.meta.url).href;
  container.append(styleLink);

  // Two-panel layout (shared with the classic editor): the selector lives in `assetPanel`;
  // the smart-crop picker / error messages take over `secondaryPanel` when needed.
  const { assetPanel, secondaryPanel } = createDialogPanels();
  container.append(assetPanel, secondaryPanel);

  const responsiveImageConfigPromise = repoConfig.isSmartCrop
    ? getResponsiveImageConfig(org, site)
    : Promise.resolve(false);

  const selectorProps = buildAssetSelectorProps({
    imsToken: token,
    repoConfig,
    onClose: onClose && (() => assetPanel.style.display !== 'none' && onClose()),
    handleSelection: buildHandleSelection({
      assetPanel,
      secondaryPanel,
      repoConfig,
      responsiveImageConfigPromise,
      getView: () => getExtensionsBridge().view,
      close: () => onClose?.(),
    }),
  });

  window.PureJSSelectors.renderAssetSelector(assetPanel, selectorProps);
}

export function getAssetsPlugin({ org, site }) {
  return {
    name: 'aem-assets',
    title: 'AEM Assets',
    experience: 'fullsize-dialog',
    ootb: false,
    sources: [],
    format: '',
    org,
    site,
  };
}
