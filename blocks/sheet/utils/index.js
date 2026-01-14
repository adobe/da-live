import { daFetch } from '../../shared/utils.js';
import { getNx } from '../../../scripts/utils.js';
import { handleSave } from './utils.js';
import '../da-sheet-tabs.js';
import { COLLAB_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import { WebsocketProvider, Y } from 'da-y-wrapper';
import { yToJSheet } from './convert.js';
import { setupEventHandlers } from './collab.js';

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
    // sheet.options.onafterchanges = () => {
    //   handleSave(el.jexcel, el.details.view);
    // };
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

async function joinCollab(el) {
  const path = el.details.sourceUrl;

  const ydoc = new Y.Doc();
  const ysheets = ydoc.getArray('sheets');

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = { protocols: ['yjs'] };

  if (window.adobeIMS?.isSignedInUser()) {
    const { token } = window.adobeIMS.getAccessToken();
    // add token to the sec-websocket-protocol header
    opts.protocols.push(token);
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, opts);

  // Increase the max backoff time to 30 seconds. If connection error occurs,
  // the socket provider will try to reconnect quickly at the beginning
  // (exponential backoff starting with 100ms) and then every 30s.
  wsProvider.maxBackoffTime = 30000;

  const yUndoManager = new Y.UndoManager(ysheets, {
    trackedOrigins: new Set(['foo']), // todo client id from awareness
  });

  return { ydoc, wsProvider, yUndoManager };
}

function rerenderSheets(el, ydoc, yUndoManager) {
  resetSheets(el);

  const ysheets = ydoc.getArray('sheets');
  const sheets = yToJSheet(ysheets);

  window.jspreadsheet.tabs(el, sheets);
  finishSetup(el, sheets);

  el.jexcel.forEach((sheet, idx) => {
    setupEventHandlers(sheet, idx, ydoc, ysheets, yUndoManager, `collab-${Math.random()}`);
  });
}

export default async function init(el, data) {
  const suppliedData = data || await getData(el.details.sourceUrl);

  await loadStyle('/deps/jspreadsheet-ce/dist/jspreadsheet.css');
  await loadScript('/deps/jspreadsheet-ce/dist/index.js');
  await loadScript('/deps/jsuites/dist/jsuites.js');

  resetSheets(el);

  const { ydoc, wsProvider, yUndoManager } = await joinCollab(el);

  wsProvider.on('sync', () => {
    rerenderSheets(el, ydoc, yUndoManager);
  });

  ydoc.on('update', (...args) => {
    rerenderSheets(el, ydoc, yUndoManager);
  });

  return el.jexcel;
}
