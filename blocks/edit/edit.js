import getPathDetails from '../shared/pathDetails.js';

let prose;
let proseEl;
let wsProvider;
let startPreviewing;
let stopPreviewing;

async function setUI(el, utils) {
  const details = getPathDetails();
  if (!details) return;

  document.title = `Edit ${details.name} - DA`;

  // Title area
  let daTitle = document.querySelector('da-title');
  if (!daTitle) {
    daTitle = document.createElement('da-title');
    daTitle.details = details;
    el.append(daTitle);
  } else {
    daTitle.details = details;
  }

  // Lazily load prose after the title has been added to DOM.
  if (!prose) prose = await import('./prose/index.js');

  // Content area
  let daContent = document.querySelector('da-content');
  if (!daContent) {
    daContent = document.createElement('da-content');
    daContent.details = details;
    el.append(daContent);
  } else {
    daContent.details = details;
  }

  const { daFetch } = await utils;
  const { permissions = [] } = await daFetch(details.sourceUrl, { method: 'HEAD' });
  daTitle.permissions = permissions;
  daContent.permissions = permissions;

  if (daContent.wsProvider) {
    daContent.wsProvider.disconnect({ data: 'Client navigation' });
    daContent.wsProvider = undefined;
  }

  ({
    proseEl,
    wsProvider,
    startPreviewing,
    stopPreviewing,
  } = prose.default({ path: details.sourceUrl, permissions }));

  daContent.proseEl = proseEl;
  daContent.wsProvider = wsProvider;
  daContent.startPreviewing = startPreviewing;
  daContent.stopPreviewing = stopPreviewing;
}

export default async function init(el) {
  const utils = import('../shared/utils.js');
  const title = import('./da-title/da-title.js');
  const content = import('./da-content/da-content.js');

  await Promise.all([utils, title, content]);

  setUI(el, utils);

  window.addEventListener('hashchange', () => {
    setUI(el, utils);
  });
}
