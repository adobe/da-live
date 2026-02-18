import getPathDetails from '../shared/pathDetails.js';
import { daFetch, checkLockdownImages, contentLogin, livePreviewLogin } from '../shared/utils.js';

import './da-title/da-title.js';
import './da-content/da-content.js';

const EMPTY_DOC = '<body><header></header><main><div></div></main><footer></footer></body>';
const DOMPARSER = new DOMParser();

let prose;

async function getDoc(path) {
  return daFetch(path);
}

async function createDoc(path) {
  const body = new FormData();
  const data = new Blob([EMPTY_DOC], { type: 'text/html' });
  body.append('data', data);
  const opts = { body, method: 'POST' };
  return daFetch(path, opts);
}

function initArea(areaName, details, el) {
  let areaEl = document.querySelector(areaName);
  if (!areaEl) {
    areaEl = document.createElement(areaName);
    areaEl.details = details;
    el.append(areaEl);
  } else {
    areaEl.details = details;
  }
  return areaEl;
}

async function setUI(el) {
  const details = getPathDetails();
  if (!details) return;

  const docPromise = getDoc(details.sourceUrl);

  document.title = `Edit ${details.name} - DA`;

  const { owner, repo } = details;
  const lockdownImages = await checkLockdownImages(owner);

  if (lockdownImages) {
    await Promise.allSettled([
      contentLogin(owner, repo),
      livePreviewLogin(owner, repo),
    ]);
  }

  const daTitle = initArea('da-title', details, el);

  const daContent = initArea('da-content', details, el);

  if (daContent.wsProvider) {
    daContent.wsProvider.disconnect({ data: 'Client navigation' });
    daContent.wsProvider = undefined;
  }

  const resp = await docPromise;

  let permissions;
  let doc;
  if (resp.status === 404) {
    const createResp = await createDoc(details.sourceUrl);
    permissions = createResp.permissions;
    doc = DOMPARSER.parseFromString(EMPTY_DOC, 'text/html');
  } else {
    permissions = resp.permissions;
    const respText = await resp.text();
    doc = DOMPARSER.parseFromString(respText, 'text/html');
  }

  daTitle.permissions = permissions;
  daContent.permissions = permissions;
  daContent.lockdownImages = lockdownImages;

  const metadataEl = doc.querySelector('main > .metadata');
  // Check if the metadata div has no additional classes (or doesn't exist)
  const isDefaultMetadata = !(metadataEl?.classList.length > 1);
  if (isDefaultMetadata) {
    // Load Default ProseMirrorEditor

    if (!prose) {
      prose = await import('./prose/index.js');
    }

    await prose.default({
      path: details.sourceUrl,
      permissions,
      doc,
      daContent,
    });
  }
  // FUTURE: else load BYO Editor
}

export default async function init(el) {
  setUI(el);

  window.addEventListener('hashchange', () => {
    setUI(el);
  });
}
