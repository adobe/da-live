import getPathDetails from '../shared/pathDetails.js';
import { daFetch } from '../shared/utils.js';

import './da-title/da-title.js';
import './da-content/da-content.js';

let prose;
let proseEl;
let wsProvider;
let earlyConnection; // For parallel loading optimization

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

  if (daContent.wsProvider) {
    daContent.wsProvider.disconnect({ data: 'Client navigation' });
    daContent.wsProvider = undefined;
    earlyConnection = undefined;
  }

  // Start HEAD and WebSocket setup in parallel
  const headPromise = checkDoc(details.sourceUrl);
  // create socket but wait to connect until prosemirror is ready
  const wsPromise = prose.createConnection(details.sourceUrl, false);

  const [resp, wsConnection] = await Promise.all([headPromise, wsPromise]);
  earlyConnection = wsConnection;

  let permissions;
  if (resp.status === 404) {
    const createResp = await createDoc(details.sourceUrl);
    permissions = createResp.permissions;
  } else {
    permissions = resp.permissions;
  }

  daTitle.permissions = permissions;
  daContent.permissions = permissions;

  ({
    proseEl,
    wsProvider,
  } = await prose.default({
    path: details.sourceUrl,
    permissions,
    wsProvider: earlyConnection.wsProvider,
    ydoc: earlyConnection.ydoc,
  }));

  daContent.proseEl = proseEl;
  daContent.wsProvider = wsProvider;

  wsProvider.connect();
}

export default async function init(el) {
  setUI(el);

  window.addEventListener('hashchange', () => {
    setUI(el);
  });
}
