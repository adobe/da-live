import getPathDetails from '../shared/pathDetails.js';
import { daFetch } from '../shared/utils.js';

import './da-title/da-title.js';
import './da-content/da-content.js';

const DOCUMENT_UPDATED_EVENT = 'da:agent-content-updated';

let prose;
let proseEl;
let wsProvider;

function normalizePath(path) {
  if (typeof path !== 'string') return '';
  return path
    .trim()
    .split('?')[0]
    .split('#')[0]
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');
}

function getContextPath(details) {
  if (!details) return '';
  const fullPath = details.fullpath || '';
  const owner = details.owner || '';
  const repo = details.repo || '';
  if (!fullPath || !owner || !repo) return '';

  const prefix = `/${owner}/${repo}/`;
  if (fullPath.startsWith(prefix)) {
    return normalizePath(fullPath.slice(prefix.length));
  }
  return normalizePath(fullPath);
}

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
  } = prose.default({ path: details.sourceUrl, permissions }));

  daContent.proseEl = proseEl;
  daContent.wsProvider = wsProvider;
}

export default async function init(el) {
  let refreshTimer;
  let refreshInFlight = false;
  let refreshQueued = false;

  const refreshEditor = async () => {
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }

    refreshInFlight = true;
    try {
      await setUI(el);
    } finally {
      refreshInFlight = false;
      if (refreshQueued) {
        refreshQueued = false;
        await refreshEditor();
      }
    }
  };

  const scheduleRefresh = (delay = 0) => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void refreshEditor();
    }, delay);
  };

  void refreshEditor();

  window.addEventListener('hashchange', () => {
    scheduleRefresh(0);
  });

  window.addEventListener(DOCUMENT_UPDATED_EVENT, (event) => {
    const details = getPathDetails();
    if (!details || details.view !== 'edit') return;

    const targetPath = normalizePath(event?.detail?.path || '');
    const currentPath = getContextPath(details);
    if (!targetPath || !currentPath || targetPath !== currentPath) return;

    scheduleRefresh(150);
  });
}
