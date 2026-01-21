import getPathDetails from '../shared/pathDetails.js';
import { daFetch } from '../shared/utils.js';

import './da-title/da-title.js';
import './da-content/da-content.js';

let prose;
let proseEl;
let wsProvider;

export async function checkDoc(path) {
  const resp = await daFetch(path);
  if (resp.status === 200) {
    // Check to see if doc has DA Form
    const text = await resp.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    // Look for a `da-form` element
    const daForm = doc.querySelector('.da-form');
    if (daForm) {
      console.log(daForm);
      window.location = window.location.href.replace('edit', 'form');
    }
  }
  return resp;
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
  // if (resp.status === 404) resp = await createDoc(details.sourceUrl);

  // const { permissions } = resp;

  // daTitle.permissions = resp.permissions;
  // daContent.permissions = resp.permissions;

  // if (daContent.wsProvider) {
  //   daContent.wsProvider.disconnect({ data: 'Client navigation' });
  //   daContent.wsProvider = undefined;
  // }

  // ({
  //   proseEl,
  //   wsProvider,
  // } = prose.default({ path: details.sourceUrl, permissions }));

  // daContent.proseEl = proseEl;
  // daContent.wsProvider = wsProvider;
}

export default async function init(el) {
  setUI(el);

  window.addEventListener('hashchange', () => {
    setUI(el);
  });
}
