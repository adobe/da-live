import { daFetch } from '../shared/utils.js';
import { getNx } from '../../scripts/utils.js';
import './da-sheet-tabs.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

const SHEET_TEMPLATE = { minDimensions: [20, 20], sheetName: 'data' };

function resetSheets(el) {
  document.querySelector('da-sheet-tabs')?.remove();
  if (!el.jexcel) return;
  delete el.jexcel;
  el.innerHTML = '';
  el.className = '';
}

function finishSetup(el, data) {
  // Set the names of each sheet to reference later
  el.jexcel.forEach((sheet, idx) => { sheet.name = data[idx].sheetName; });

  // Setup tabs
  const daSheetTabs = document.createElement('da-sheet-tabs');
  el.insertAdjacentElement('beforebegin', daSheetTabs);
}

function getDefaultSheet() {
  return [
    { ...SHEET_TEMPLATE },
  ];
}

function getSheetData(sheetData) {
  if (!sheetData?.length) return [[], []];
  const header = Object.keys(sheetData[0]).map((key) => key);
  const data = sheetData.reduce((acc, item) => {
    const values = Object.keys(item).map((key) => item[key]);
    acc.push(values);
    return acc;
  }, []);
  return [header, ...data];
}

export async function getData(url) {
  const resp = await daFetch(url);
  if (!resp.ok) return getDefaultSheet();

  const sheets = [];

  // Get base data
  const json = await resp.json();
  const names = json[':names'];

  // Single sheet
  if (json[':type'] === 'sheet') {
    const data = getSheetData(json.data);
    const columns = data[0].map(() => ({ width: '300px' }));
    const dataSheet = {
      ...SHEET_TEMPLATE,
      sheetName: 'data',
      data,
      columns,
    };

    sheets.push(dataSheet);
  }

  // Multi sheet
  if (names) {
    names.forEach((sheetName) => {
      const data = getSheetData(json[sheetName].data);
      const columns = data[0].map(() => ({ width: '300px' }));
      sheets.push({
        ...SHEET_TEMPLATE,
        sheetName,
        data,
        columns,
      });
    });
  }
  return sheets;
}

export default async function init(el) {
  const suppliedData = await getData(el.details.sourceUrl);

  await loadStyle('/deps/jspreadsheet-ce/dist/jspreadsheet.css');
  await loadScript('/deps/jspreadsheet-ce/dist/index.js');
  await loadScript('/deps/jsuites/dist/jsuites.js');

  resetSheets(el);

  // Initialize the spreadsheet
  window.jspreadsheet.tabs(el, suppliedData);
  // Manually fix it to be what we need
  finishSetup(el, suppliedData);

  return el.jexcel;
}
