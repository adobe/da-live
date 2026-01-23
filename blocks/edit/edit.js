import { Y, WebsocketProvider } from 'da-y-wrapper';
import getPathDetails from '../shared/pathDetails.js';
import { daFetch, getAuthToken } from '../shared/utils.js';
import { COLLAB_ORIGIN, DA_ORIGIN } from '../shared/constants.js';

import './da-title/da-title.js';
import './da-content/da-content.js';

let prosePromise;
let prose;

async function createConnection(path) {
  const ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = {
    protocols: ['yjs'],
    connect: true,
  };

  const token = await getAuthToken();
  if (token) {
    opts.protocols.push(token);
  }

  const provider = new WebsocketProvider(server, roomName, ydoc, opts);

  // Increase the max backoff time to 30 seconds. If connection error occurs,
  // the socket provider will try to reconnect quickly at the beginning
  // (exponential backoff starting with 100ms) and then every 30s.
  provider.maxBackoffTime = 30000;

  return { wsProvider: provider, ydoc };
}

async function checkDoc(path) {
  return daFetch(path, { method: 'HEAD' });
}

async function createDoc(path) {
  const body = new FormData();
  const data = new Blob(['<body><header></header><main><div></div></main><footer></footer></body>'], { type: 'text/html' });
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

  // Start HEAD check and WebSocket connection in parallel
  const headPromise = checkDoc(details.sourceUrl);
  const wsPromise = createConnection(details.sourceUrl);

  document.title = `Edit ${details.name} - DA`;

  if (!prosePromise) {
    prosePromise = import('./prose/index.js');
  }

  const daTitle = initArea('da-title', details, el);

  // Lazily load prose after the title has been added to DOM.
  if (!prose) prose = await prosePromise;

  const daContent = initArea('da-content', details, el);

  if (daContent.wsProvider) {
    daContent.wsProvider.disconnect({ data: 'Client navigation' });
    daContent.wsProvider = undefined;
  }

  const resp = await headPromise;

  let permissions;
  if (resp.status === 404) {
    const createResp = await createDoc(details.sourceUrl);
    permissions = createResp.permissions;
  } else {
    permissions = resp.permissions;
  }

  daTitle.permissions = permissions;
  daContent.permissions = permissions;

  const {
    proseEl,
    wsProvider,
  } = await prose.default({
    path: details.sourceUrl,
    permissions,
    wsPromise,
  });

  daContent.proseEl = proseEl;
  daContent.wsProvider = wsProvider;
}

export default async function init(el) {
  setUI(el);

  window.addEventListener('hashchange', () => {
    setUI(el);
  });
}
