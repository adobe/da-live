import getPathDetails from '../shared/pathDetails.js';
import { daFetch } from '../shared/utils.js';

import './da-title/da-title.js';
import './da-content/da-content.js';

let prose;
let proseEl;
let wsProvider;
let startPreviewing;
let stopPreviewing;

export async function checkDoc(path) {
  return daFetch(path, { method: 'HEAD' });
}

async function createDoc(path) {
  const body = new FormData();
  const data = new Blob(['<body><header></header><main><div></div></main><footer></footer></body>'], { type: 'text/html' });
  body.append('data', data);
  const opts = { body, method: 'POST' };
  return daFetch(path, opts);
}

async function setUI(el) {
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

  let resp = await checkDoc(details.sourceUrl);

  // Create the doc if it does not exist
  if (resp.status === 404) resp = await createDoc(details.sourceUrl);

  const { permissions } = resp;

  daTitle.permissions = resp.permissions;
  daContent.permissions = resp.permissions;

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
  setUI(el);

  window.addEventListener('hashchange', () => {
    setUI(el);
  });
}
