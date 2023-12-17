import '../edit/da-title/da-title.js';
import { getLibs } from '../../scripts/utils.js';

import getPathDetails from '../shared/pathDetails.js';

function createToolbar(el) {
  jSuites.toolbar(el, {
    container: true,
    items: [{
      type: 'icon',
      content: 'undo',
      onclick: function () {
        console.log('undo action');
      }
    },
    {
      type: 'icon',
      content: 'redo',
      onclick: function () {
        console.log('redo action');
      }
    },
    ]
  });
}

export default async function init(el) {
  const { loadScript, loadStyle } = await import(`${getLibs()}/utils/utils.js`);

  await loadStyle('/deps/jspreadsheet/dist/jspreadsheet.css');
  await loadStyle('https://jsuites.net/v4/jsuites.css');
  await loadStyle('https://fonts.googleapis.com/css?family=Material+Icons');
  await loadScript('/deps/jspreadsheet/dist/index.js');
  await loadScript('https://jsuites.net/v4/jsuites.js');

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

  const daSheetWrapper = document.createElement('div');
  daSheetWrapper.classList.add('da-sheet-wrapper');
  const daSheet = document.createElement('div');
  const daToolbar = document.createElement('div');

  createToolbar(daToolbar);

  daSheetWrapper.append(daToolbar, daSheet);


  const data = [
    ['PHP', '14:00'],
    ['Javascript', '16:30'],
  ];

  const cols = [
    { width: '200px' },
    { width: '200px' },
  ];

  const columns = data[0].map((col) => {
    return { width: '200px' };
  });

  el.append(daTitle, daSheetWrapper);

  const sheet = jspreadsheet(daSheet, {
    data,
    minSpareCols: 10,
    minSpareRows: 10,
    columns,
  });

  console.log(sheet);

  window.addEventListener('hashchange', async () => {
    details = getPathDetails();
    daTitle.details = details;
    daSheet.details = details;
  });
}
