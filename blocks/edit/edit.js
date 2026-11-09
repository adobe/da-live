import { render } from 'da-lit';
import getPathDetails from '../shared/pathDetails.js';
import { contentLogin, livePreviewLogin } from '../shared/utils.js';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { renderEmptyList, EMPTY_LIST_CSS, NOT_PERMITTED } from '../shared/empty-list.js';

import './da-title/da-title.js';
import './da-content/da-content.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [buttonStyles, emptyListStyles, styles] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(EMPTY_LIST_CSS),
  loadStyle(import.meta.url),
]);
document.adoptedStyleSheets.push(buttonStyles, emptyListStyles, styles);

const EMPTY_DOC = '<body><header></header><main><div></div></main><footer></footer></body>';
const DOMPARSER = new DOMParser();

let prose;
let prosePromise;

async function getDoc(path) {
  const { source } = await getNx2Api();
  return source.get(path);
}

async function createDoc(path) {
  const { source } = await getNx2Api();
  return source.save(path, { body: EMPTY_DOC });
}

export function showNotPermitted({ el, daTitle, message }) {
  el.querySelector('da-content')?.remove();
  daTitle.hideActions = true;
  let container = el.querySelector('.da-edit-not-permitted');
  if (!container) {
    container = document.createElement('div');
    container.className = 'da-edit-not-permitted';
    el.append(container);
  }
  render(renderEmptyList(message), container);
}

export function removeNotPermitted({ el, daTitle }) {
  el.querySelector('.da-edit-not-permitted')?.remove();
  daTitle.hideActions = false;
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

  try {
    const { isEWEnabled } = await getNxEWFlags();
    if (await isEWEnabled({ org: details.org, site: details.site })) {
      window.location.href = `/canvas${window.location.search}#${details.fullpath.replace(/\.html$/, '')}`;
      return;
    }
  } catch {
    // Flag check unavailable — fall through to the normal editor.
  }

  // Warm the hlx6 probe cache up front so createConnection's `await isHlx6(...)`
  // resolves from cache instead of gating the WebSocket on a network round-trip.
  getNx2Api().then(({ isHlx6 }) => isHlx6(details.org, details.site)).catch(() => {});

  const docPromise = getDoc(details.fullpath);
  prosePromise ??= import('./prose/index.js');

  // Start WebSocket as soon as prose module loads (don't wait for logins/doc)
  const wsPromise = prosePromise.then(
    (mod) => mod.createConnection(details.sourceUrl),
  );

  document.title = `Edit ${details.name} - DA`;

  const { owner, repo } = details;
  const contentCookiePromise = contentLogin(owner, repo);

  const daTitle = initArea('da-title', details, el);

  const daContent = initArea('da-content', details, el);

  if (daContent.wsProvider) {
    daContent.wsProvider.disconnect({ data: 'Client navigation' });
    daContent.wsProvider = undefined;
  }

  const resp = await docPromise;

  if (resp.status === 401 || resp.status === 403) {
    wsPromise.then(({ wsProvider }) => wsProvider.disconnect()).catch(() => {});
    daTitle.permissions = resp.permissions;
    const message = resp.status === 401 ? 'Sign in required' : NOT_PERMITTED;
    showNotPermitted({ el, daTitle, message });
    return;
  }
  removeNotPermitted({ el, daTitle });

  let permissions;
  let doc;
  if (resp.status === 404) {
    const { default: showNotFoundDialog } = await import('./da-not-found/da-not-found.js');
    const choice = await showNotFoundDialog(details);
    // A hashchange spawns a parallel setUI for the new path — bail out of
    // this one so the two don't race over window.location / editor state.
    if (choice === 'hashchange') return;
    if (choice === 'folder') {
      const folderPath = details.fullpath.replace(/\.html$/, '');
      const hashPath = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
      window.location = `/#${hashPath}`;
      return;
    }
    if (choice !== 'create') {
      window.location = `/#${details.parent}`;
      return;
    }
    const createResp = await createDoc(details.fullpath);
    permissions = createResp.permissions;
    doc = DOMPARSER.parseFromString(EMPTY_DOC, 'text/html');
  } else {
    permissions = resp.permissions;
    const respText = await resp.text();
    doc = DOMPARSER.parseFromString(respText, 'text/html');
  }

  daTitle.permissions = permissions;
  daContent.permissions = permissions;

  // If content cookie hasn't loaded yet, wait for it
  await contentCookiePromise;

  const metadataEl = doc.querySelector('main > .metadata');
  // Check if the metadata div has no additional classes (or doesn't exist)
  const isDefaultMetadata = !(metadataEl?.classList.length > 1);
  if (isDefaultMetadata) {
    // Load Default ProseMirrorEditor

    if (!prose) {
      prose = await prosePromise;
    }

    await prose.default({
      path: details.sourceUrl,
      permissions,
      doc,
      daContent,
      wsPromise,
    });

    // Load editor tabs (live preview, versions, etc.)
    setTimeout(() => daContent.handleEditorLoaded(), 1000);

    // set the live preview cookie async
    livePreviewLogin(owner, repo);
  }

  // FUTURE: else load BYO Editor
}

export default async function init(el) {
  setUI(el);

  window.addEventListener('hashchange', () => {
    setUI(el);
  });
}
