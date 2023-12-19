import '../edit/da-title/da-title.js';
import './da-toolbar.js';
import initSheet from './jspreadsheet/index.js';

import getPathDetails from '../shared/pathDetails.js';

async function getData(details) {
  const resp = await fetch(details.sourceUrl);
  if (!resp.ok) return;
  const json = await resp.json();

  const data = json.data.reduce((acc, item, idx) => {
    if (idx === 0) {
      const keys = [];
      Object.keys(item).forEach((key) => {
        keys.push(key);
      });
      acc.push(keys);
    }
    const values = [];
    Object.keys(item).forEach((key) => {
      values.push(item[key]);
    });
    acc.push(values);

    return acc;
  }, []);
  console.log(data);
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

  const wrapper = document.createElement('div');
  wrapper.classList.add('da-sheet-wrapper');
  const daSheet = document.createElement('div');
  wrapper.append(daSheet);
  el.append(daTitle, wrapper);

  const data = await getData(details);
  const sheet = await initSheet(daSheet, data);

  const daToolbar = document.createElement('da-toolbar');
  daToolbar.sheet = sheet;
  daTitle.sheet = sheet;

  wrapper.insertAdjacentElement('afterbegin', daToolbar);

  window.addEventListener('hashchange', async () => {
    details = getPathDetails();
    daTitle.details = details;
  });
}
