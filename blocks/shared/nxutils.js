import { getNx } from '../../scripts/utils.js';

const {
  DA_ADMIN, DA_COLLAB, DA_CONTENT, DA_ETC, DA_PREVIEW,
  HLX_ADMIN, AEM_API, ALLOWED_TOKEN,
  hashChange, loadStyle, loadPageStyle, HashController, getEnv,
} = await import(`${getNx()}/utils/utils.js`);

const { openPanel, getPanelStore, closePanel } = await import(`${getNx()}/utils/panel.js`);
const { loadHrefSvg, ICONS_BASE } = await import(`${getNx()}/utils/svg.js`);
const { fetchDaConfigs, getFirstSheet } = await import(`${getNx()}/utils/daConfig.js`);
const {
  buildAemPathFromHashState,
  formatAemPreviewPublishError,
  runAemPreviewOrPublish,
} = await import(`${getNx()}/utils/aem-preview-publish.js`);

export {
  getNx,
  DA_ADMIN, DA_COLLAB, DA_CONTENT, DA_ETC, DA_PREVIEW,
  HLX_ADMIN, AEM_API, ALLOWED_TOKEN,
  hashChange, loadStyle, loadPageStyle, HashController, getEnv,
  openPanel, getPanelStore, closePanel,
  loadHrefSvg, ICONS_BASE,
  fetchDaConfigs, getFirstSheet,
  buildAemPathFromHashState, formatAemPreviewPublishError, runAemPreviewOrPublish,
};
