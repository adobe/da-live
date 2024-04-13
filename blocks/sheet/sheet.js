import '../edit/da-title/da-title.js';

import getPathDetails from '../shared/pathDetails.js';

let initSheet;

async function setSheet(details, daTitle, daSheet) {
  daTitle.details = details;
  daSheet.details = details;

  if (!initSheet) initSheet = (await import('./index.js')).default;
  daTitle.sheet = await initSheet(daSheet);
}

export default async function init(el) {
  let details = getPathDetails();
  if (!details) {
    el.innerHTML = '<h1>Please edit a sheet.</h1>';
    return;
  }

  document.title = `Edit sheet ${details.name} - Dark Alley`;

  // Title Pane
  const daTitle = document.createElement('da-title');

  // Edit Pane
  const wrapper = document.createElement('div');
  wrapper.classList.add('da-sheet-wrapper');
  const daSheet = document.createElement('div');
  wrapper.append(daSheet);

  // Set data against the title & sheet
  setSheet(details, daTitle, daSheet);

  el.append(daTitle, wrapper);

  window.addEventListener('hashchange', async () => {
    details = getPathDetails();
    setSheet(details, daTitle, daSheet);
  });
}
