import { daFetch } from '../../shared/utils.js';
import { getNx } from '../../../scripts/utils.js';
import { debouncedSaveSheets } from './utils.js';
import '../da-sheet-tabs.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

const SHEET_TEMPLATE = { minDimensions: [20, 20], sheetName: 'data' };

let permissions;
let canWrite;

function resetSheets(el) {
  document.querySelector('da-sheet-tabs')?.remove();
  if (!el.jexcel) return;
  delete el.jexcel;
  el.innerHTML = '';
  el.className = '';
}

function finishSetup(el, data) {
  // Set the names of each sheet to reference later
  el.jexcel.forEach((sheet, idx) => {
    sheet.name = data[idx].sheetName;
    sheet.options.onbeforepaste = (_el, pasteVal) => pasteVal?.trim();
    if (el.details.view !== 'config') {
      sheet.options.onafterchanges = () => {
        debouncedSaveSheets(el.jexcel);
      };
    }
  });

  // Setup tabs
  const daSheetTabs = document.createElement('da-sheet-tabs');
  daSheetTabs.permissions = permissions;
  el.insertAdjacentElement('beforebegin', daSheetTabs);
}

function getDefaultSheet() {
  return [
    { ...SHEET_TEMPLATE, minDimensions: [20, 20] },
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

const getColWidths = (colWidths, headers) => {
  if (colWidths) {
    return colWidths?.map((width) => {
      const opts = { width: `${width}` };
      if (!canWrite) opts.readOnly = true;
      return opts;
    });
  }
  return headers.map(() => {
    const opts = { width: '300' };
    if (!canWrite) opts.readOnly = true;
    return opts;
  });
};

function getSheet(json, sheetName) {
  const data = getSheetData(json.data);
  const templ = { ...SHEET_TEMPLATE };
  if (!canWrite) delete templ.minDimensions;

  return {
    ...templ,
    sheetName,
    data,
    columns: getColWidths(json[':colWidths'], data[0]),
  };
}

export function getPermissions() {
  return permissions;
}

export async function getData(url) {
  const resp = await daFetch(url);

  // Set permissions even if the file is a 404
  const daTitle = document.querySelector('da-title');
  if (daTitle) daTitle.permissions = resp.permissions;

  permissions = resp.permissions;
  canWrite = resp.permissions?.some((permission) => permission === 'write');

  if (!resp.ok) return getDefaultSheet();

  const sheets = [];

  // Get base data
  const json = await resp.json();

  const sheetPanes = document.querySelector('da-sheet-panes');
  if (sheetPanes && !url.includes('/versionsource')) {
    // Set AEM-formatted JSON for real-time preview
    sheetPanes.data = json;
  }

  // Single sheet
  if (json[':type'] === 'sheet') {
    sheets.push(getSheet(json, json[':sheetname'] || 'data'));
  }

  // Multi sheet
  const names = json[':names'];
  if (names) {
    names.forEach((sheetName) => {
      sheets.push(getSheet(json[sheetName], sheetName));
    });
  }

  const privateSheets = json[':private'];
  if (privateSheets) {
    Object.keys(privateSheets).forEach((sheetName) => {
      sheets.push(getSheet(privateSheets[sheetName], sheetName));
    });
  }

  return sheets;
}

export default async function init(el, data) {
  const suppliedData = data || await getData(el.details.sourceUrl);

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
