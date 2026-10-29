import getPathDetails from '../shared/pathDetails.js';
import { contentLogin, livePreviewLogin } from '../shared/utils.js';
import { getNx, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { OFFLINE_MODE } from '../shared/constants.js';

import './da-title/da-title.js';
import './da-content/da-content.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const styles = await loadStyle(import.meta.url);
document.adoptedStyleSheets.push(styles);

const EMPTY_DOC = '<body><header></header><main><div></div></main><footer></footer></body>';
const DOMPARSER = new DOMParser();

let prose;
let prosePromise;
let editorLoadCount = 0;

async function getDoc(path) {
  const { source } = await getNx2Api();
  return source.get(path);
}

async function createDoc(path) {
  const { source } = await getNx2Api();
  return source.save(path, { body: EMPTY_DOC });
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

async function flushPendingEditor(daContent) {
  if (!daContent?.hasPendingSave) return true;
  const saved = await daContent.forceSave();
  if (!saved.ok) window.location.hash = `#${daContent.details.fullpath}`;
  return saved.ok;
}

export async function setUI(el) {
  editorLoadCount += 1;
  const loadCount = editorLoadCount;
  const details = getPathDetails();
  if (!details) return;
  const currentContent = document.querySelector('da-content');
  if (currentContent?.hasPendingSave
    && currentContent.details?.fullpath === details.fullpath) return;
  const offline = currentContent?.offline ?? OFFLINE_MODE;

  let useCanvas = false;
  try {
    const { isEWEnabled } = await getNxEWFlags();
    useCanvas = await isEWEnabled({ org: details.org, site: details.site });
  } catch {
    // Flag check unavailable — fall through to the normal editor.
  }
  if (loadCount !== editorLoadCount) return;
  if (useCanvas) {
    if (!await flushPendingEditor(currentContent) || loadCount !== editorLoadCount) return;
    window.location.href = `/canvas#${details.fullpath.replace(/\.html$/, '')}`;
    return;
  }

  // Warm the hlx6 probe cache up front so createConnection's `await isHlx6(...)`
  // resolves from cache instead of gating the WebSocket on a network round-trip.
  if (!offline) getNx2Api().then(({ isHlx6 }) => isHlx6(details.org, details.site)).catch(() => {});

  const docPromise = getDoc(details.fullpath);
  prosePromise ??= import('./prose/index.js');

  // Start WebSocket as soon as prose module loads (don't wait for logins/doc)
  const wsPromise = offline ? undefined : prosePromise.then(
    (mod) => mod.createConnection(details.sourceUrl),
  );
  const connectionResult = wsPromise?.then(
    (connection) => ({ connection }),
    (error) => {
      // The initializer will surface this error if it adopts the connection.
      // eslint-disable-next-line no-console
      console.error('[editor] Could not connect to collaboration', error);
      return {};
    },
  );
  let adopted = false;

  try {
    const { owner, repo } = details;
    const contentCookiePromise = contentLogin(owner, repo);

    const resp = await docPromise;
    if (loadCount !== editorLoadCount) return;

    let permissions;
    let doc;
    if (resp.status === 404) {
      const { default: showNotFoundDialog } = await import('./da-not-found/da-not-found.js');
      const choice = await showNotFoundDialog(details);
      // A hashchange spawns a parallel setUI for the new path — bail out of
      // this one so the two don't race over window.location / editor state.
      if (choice === 'hashchange' || loadCount !== editorLoadCount) return;
      if (choice === 'folder') {
        if (!await flushPendingEditor(currentContent) || loadCount !== editorLoadCount) return;
        const folderPath = details.fullpath.replace(/\.html$/, '');
        const hashPath = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
        window.location = `/#${hashPath}`;
        return;
      }
      if (choice !== 'create') {
        if (!await flushPendingEditor(currentContent) || loadCount !== editorLoadCount) return;
        window.location = `/#${details.parent}`;
        return;
      }
      const createResp = await createDoc(details.fullpath);
      if (loadCount !== editorLoadCount) return;
      if (!createResp.ok) throw new Error(`Could not create the document (${createResp.status}).`);
      permissions = createResp.permissions || ['read'];
      doc = DOMPARSER.parseFromString(EMPTY_DOC, 'text/html');
    } else {
      if (!resp.ok) {
        if (currentContent?.proseEl) {
          window.location.hash = `#${currentContent.details.fullpath}`;
        } else {
          document.title = `Edit ${details.name} - DA`;
          const daTitle = initArea('da-title', details, el);
          daTitle.permissions = [];
        }
        throw new Error(`Could not load the document (${resp.status}).`);
      }
      permissions = resp.permissions || ['read'];
      const respText = await resp.text();
      doc = DOMPARSER.parseFromString(respText, 'text/html');
    }

    // If content cookie hasn't loaded yet, wait for it
    await contentCookiePromise;
    if (loadCount !== editorLoadCount) return;
    if (!await flushPendingEditor(currentContent) || loadCount !== editorLoadCount) return;
    currentContent?.destroyEditor?.();

    document.title = `Edit ${details.name} - DA`;
    const daTitle = initArea('da-title', details, el);
    const daContent = initArea('da-content', details, el);
    daTitle.permissions = permissions;
    daContent.permissions = permissions;
    daContent.handleVersionReset();

    const metadataEl = doc.querySelector('main > .metadata');
    // Check if the metadata div has no additional classes (or doesn't exist)
    const isDefaultMetadata = !(metadataEl?.classList.length > 1);
    if (isDefaultMetadata) {
      if (!prose) {
        prose = await prosePromise;
      }
      if (loadCount !== editorLoadCount) return;

      await prose.default({
        path: details.sourceUrl,
        permissions,
        doc,
        daContent,
        wsPromise,
        sourcePath: details.fullpath,
        offline,
        isCurrent: () => loadCount === editorLoadCount,
      });
      adopted = true;
      if (loadCount !== editorLoadCount) return;

      // Load editor tabs (live preview, versions, etc.)
      setTimeout(() => {
        if (loadCount === editorLoadCount) daContent.handleEditorLoaded();
      }, 1000);

      // set the live preview cookie async
      livePreviewLogin(owner, repo);
    }

    // FUTURE: else load BYO Editor
  } finally {
    if (!adopted && connectionResult) {
      const { connection } = await connectionResult;
      if (connection) {
        connection.wsProvider.destroy();
        connection.ydoc.destroy();
      }
    }
  }
}

async function loadUI(el) {
  try {
    await setUI(el);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[editor] Could not load document', error);
    const { showToast } = await import(`${getNx()}/blocks/shared/toast/toast.js`);
    showToast({ text: error.message || 'Could not load the document.', variant: 'error' });
  }
}

export default async function init(el) {
  loadUI(el);

  window.addEventListener('hashchange', () => {
    loadUI(el);
  });
}
