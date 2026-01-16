import { daFetch } from '../../shared/utils.js';
import { getNx } from '../../../scripts/utils.js';
import '../da-sheet-tabs.js';
import { yToJSheet, jSheetToY } from '../collab/convert.js';
import { setupEventHandlers } from '../collab/events.js';
import joinCollab, { drawOverlays } from '../collab/index.js';
import { captureSpreadsheetState, restoreSpreadsheetState } from '../collab/position.js';

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

async function checkPermissions(url) {
  const resp = await daFetch(url, { method: 'HEAD' });

  const daTitle = document.querySelector('da-title');
  if (daTitle) daTitle.permissions = resp.permissions;

  permissions = resp.permissions;
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

function checkSheetDimensionsEqual(jExcelData, newDataFromY) {
  if (!jExcelData || !newDataFromY) return false;
  const jExcelSheetCount = jExcelData.length;
  const newSheetCount = newDataFromY.length;
  // compare number of sheets
  if (jExcelSheetCount !== newSheetCount) return false;
  // compare sheet names
  for (let i = 0; i < jExcelSheetCount; i += 1) {
    if (jExcelData[i].name !== newDataFromY[i].sheetName) return false;
  }

  // check col/row count
  for (let i = 0; i < jExcelSheetCount; i += 1) {
    const oldData = jExcelData[i].getData();
    const newData = newDataFromY[i].data;
    if (oldData.length !== newData.length) return false;
    for (let j = 0; j < oldData.length; j += 1) {
      if (oldData[j].length !== newData[j].length) return false;
    }
  }
  return true;
}

function rerenderSheets(el, ydoc, yUndoManager, wsProvider) {
  const wrapper = el.closest('.da-sheet-wrapper');
  const ysheets = ydoc.getArray('sheets');
  let sheets = yToJSheet(ysheets);

  if (sheets.length === 0) {
    console.error('No sheets found in Yjs document');
    return;
  }
  const savedState = captureSpreadsheetState(wrapper);

  resetSheets(el);

  window.jspreadsheet.tabs(el, sheets);
  finishSetup(el, sheets);

  restoreSpreadsheetState(wrapper, savedState);

  el.jexcel.forEach((sheet, idx) => {
    setupEventHandlers(sheet, idx, ydoc, ysheets, yUndoManager, listenerContext, wsProvider);
  });

  // Redraw collaboration overlays after rerender
  if (wsProvider?.awareness) {
    drawOverlays(wsProvider.awareness.getStates(), wsProvider.awareness.clientID);
  }

  // Set up listener for tab changes to redraw overlays
  const daSheetTabs = wrapper.querySelector('da-sheet-tabs');
  if (daSheetTabs && wsProvider?.awareness) {
    daSheetTabs.removeEventListener('sheet-changed', daSheetTabs._sheetChangedHandler);
    daSheetTabs._sheetChangedHandler = () => {
      drawOverlays(wsProvider.awareness.getStates(), wsProvider.awareness.clientID);
    };
    daSheetTabs.addEventListener('sheet-changed', daSheetTabs._sheetChangedHandler);
  }

  // Set up listener for scroll events to redraw overlays
  const jexcelContent = wrapper.querySelector('.jexcel_content');
  if (jexcelContent && wsProvider?.awareness) {
    jexcelContent.removeEventListener('scroll', jexcelContent._scrollHandler);
    jexcelContent._scrollHandler = () => {
      drawOverlays(wsProvider.awareness.getStates(), wsProvider.awareness.clientID);
    };
    jexcelContent.addEventListener('scroll', jexcelContent._scrollHandler, { passive: true });
  }
}

let listenerContext = { disableListeners: false };
function updateSheetsInPlace(el, sheets) {
  listenerContext.disableListeners = true;
  const tabs = el.closest('.da-sheet-wrapper').querySelector('da-sheet-tabs');

  tabs.jexcel.forEach((sheet, idx) => {
    const newSheet = sheets[idx];

    newSheet.data.forEach((row, rowIdx) => {
      row.forEach((cell, colIdx) => {
        sheet.setValueFromCoords(colIdx, rowIdx, newSheet.data[rowIdx][colIdx]);
      });
    });
  });
  listenerContext.disableListeners = false;
}

function updateSheets(el, ydoc, yUndoManager, wsProvider) {
  const ysheets = ydoc.getArray('sheets');
  let sheets = yToJSheet(ysheets);

  if (sheets.length === 0) {
    console.error('No sheets found in Yjs document');
    return;
  }

  const dimensionsEqual = checkSheetDimensionsEqual(el.jexcel, sheets);
  if (dimensionsEqual) {
    // update in-place. This preserves the editor state better.
    updateSheetsInPlace(el, sheets);
  } else {
    // Re-render to match dimensions, tab names etc.
    // rerender full sheets after a timeout to allow events 
    // (eg navigate to next cell) to complete before capturing state
    setTimeout(() => {
      rerenderSheets(el, ydoc, yUndoManager, wsProvider);
    }, 0);
  }
}

export default async function init(el) {
  await checkPermissions(el.details.sourceUrl);

  await loadStyle('/deps/jspreadsheet-ce/dist/jspreadsheet.css');
  await loadScript('/deps/jspreadsheet-ce/dist/index.js');
  await loadScript('/deps/jsuites/dist/jsuites.js');

  resetSheets(el);

  const { ydoc, wsProvider, yUndoManager } = await joinCollab(el);

  wsProvider.on('sync', () => {
    rerenderSheets(el, ydoc, yUndoManager, wsProvider);
  });

  ydoc.on('update', () => {
    updateSheets(el, ydoc, yUndoManager, wsProvider);
  });

  return { jexcel: el.jexcel, ydoc };
}
