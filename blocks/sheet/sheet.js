import '../edit/da-title/da-title.js';
import './da-toolbar.js';

import getPathDetails from '../shared/pathDetails.js';

async function getData(details) {
  const { daFetch } = await import('../shared/utils.js');

  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return null;
  const json = await resp.json();

  const data = json.data.reduce((acc, item) => {
    const values = Object.keys(item).map((key) => item[key]);
    acc.push(values);
    return acc;
  }, []);

  return data;
}

export default async function init(el) {
  let details = getPathDetails();
  if (!details) {
    el.classList.add('no-url');
    el.innerHTML = '<h1>Please edit a sheet.</h1>';
    return;
  }

  document.title = `Edit ${details.name} - Dark Alley`;

  // Title Pane
  const daTitle = document.createElement('da-title');
  daTitle.details = details;
  el.append(daTitle);

  const { default: initSheet } = await import('./jspreadsheet/index.js');
  const wrapper = document.createElement('div');
  wrapper.classList.add('da-sheet-wrapper');
  const daSheet = document.createElement('div');
  wrapper.append(daSheet);
  el.append(wrapper);

  // Promise based so rendering of the block can continue while data is being fetched.
  getData(details).then(async (data) => {
    const sheet = await initSheet(daSheet, data);
    const daToolbar = document.createElement('da-toolbar');
    daToolbar.sheet = sheet;
    daTitle.sheet = sheet;
    wrapper.insertAdjacentElement('afterbegin', daToolbar);
  });

  window.addEventListener('hashchange', async () => {
    details = getPathDetails();
    daTitle.details = details;
  });
}
