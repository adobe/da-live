import { daFetch } from '../shared/utils.js';
import { getNx } from '../../scripts/utils.js';
import { Y } from '/deps/da-y-wrapper/dist/index.js';
import {
  getSheets,
  jSheetToY,
  yToJSheet,
  updateCell,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  moveRow,
  moveColumn,
} from './utils.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

export default async function init(el) {
  const demoSheet = 'https://stage-admin.da.live/source/hannessolo/da-playground/testsheet.json';

  const resp = await daFetch(demoSheet);
  const json = await resp.json();

  await loadStyle('/deps/jspreadsheet-ce/dist/jspreadsheet.css');
  await loadScript('/deps/jspreadsheet-ce/dist/index.js');
  await loadScript('/deps/jsuites/dist/jsuites.js');

  const sheetsTop = getSheets(json);
  const sheetsBottom = getSheets(json);
  
  // Convert to Yjs structure - create base doc first
  const baseYSheet = jSheetToY(sheetsTop);
  
  // Clone the state to create two separate docs with common history
  const baseState = Y.encodeStateAsUpdate(baseYSheet.ydoc);
  
  // Create top doc from base
  const ySheetTop = {
    ydoc: baseYSheet.ydoc,
    ysheets: baseYSheet.ysheets
  };
  
  // Create bottom doc from base state
  const ySheetBottom = {
    ydoc: new Y.Doc(),
    ysheets: null
  };
  Y.applyUpdate(ySheetBottom.ydoc, baseState);
  ySheetBottom.ysheets = ySheetBottom.ydoc.getArray('sheets');

  // Flag to prevent infinite loops when applying synced data
  let isApplyingSync = false;

  const topContainer = document.createElement('div');
  const bottomContainer = document.createElement('div');
  const syncButton = document.createElement('button');

  topContainer.classList.add('da-sheet-top');
  bottomContainer.classList.add('da-sheet-bottom');
  syncButton.textContent = 'Sync Data Between Sheets';
  syncButton.style.cssText = 'margin: 20px; padding: 10px 20px; font-size: 16px; cursor: pointer;';

  el.append(topContainer, syncButton, bottomContainer);

  window.jspreadsheet.tabs(topContainer, sheetsTop);
  window.jspreadsheet.tabs(bottomContainer, sheetsBottom);

  // Helper to reload sheet from Y state
  const reloadFromYState = (sheet, idx, ysheets) => {
    isApplyingSync = true;
    try {
      const convertedSheets = yToJSheet(ysheets);
      const newData = convertedSheets[idx].data;
      sheet.setData(newData);
      console.log(`Reloaded sheet ${idx} from Y state:`, newData);
    } finally {
      isApplyingSync = false;
    }
  };

  // Helper to setup granular event handlers
  const setupEventHandlers = (sheet, idx, ydoc, ysheets, label) => {
    const ysheet = ysheets.get(idx);
    const ydata = ysheet.get('data');

    // Cell value change
    sheet.options.onchange = (instance, cell, colIndex, rowIndex, value) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Cell changed at [${rowIndex}, ${colIndex}] to "${value}"`);
      
      ydoc.transact(() => {
        updateCell(ydata, rowIndex, colIndex, value);
      });
      
      // Reload from Y state to verify
      reloadFromYState(sheet, idx, ysheets);
    };

    // Row inserted
    sheet.options.oninsertrow = (instance, rowIndex, numOfRows, rowData, insertBefore) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Inserted ${numOfRows} row(s) at index ${rowIndex}, insertBefore: ${insertBefore}`);
      
      ydoc.transact(() => {
        const numColumns = ydata.length > 0 ? ydata.get(0).toArray().length : 0;
        // If insertBefore is false, we want to insert after the selected row
        // so we need to adjust the index
        const insertIndex = insertBefore ? rowIndex : rowIndex + 1;
        console.log(`[${label}] Actual insert index: ${insertIndex}`);
        
        for (let i = 0; i < numOfRows; i++) {
          insertRow(ydata, insertIndex + i, null, numColumns);
        }
      });
      
      // Reload from Y state to verify
      reloadFromYState(sheet, idx, ysheets);
    };

    // Row deleted
    sheet.options.ondeleterow = (instance, rowIndex, numOfRows) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Deleted ${numOfRows} row(s) at index ${rowIndex}`);
      
      ydoc.transact(() => {
        deleteRow(ydata, rowIndex, numOfRows);
      });
      
      // Reload from Y state to verify
      reloadFromYState(sheet, idx, ysheets);
    };

    // Column inserted
    sheet.options.oninsertcolumn = (instance, colIndex, numOfColumns, insertBefore) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Inserted ${numOfColumns} column(s) at index ${colIndex}, insertBefore: ${insertBefore}`);
      
      ydoc.transact(() => {
        // If insertBefore is false, we want to insert after the selected column
        // so we need to adjust the index
        const insertIndex = insertBefore ? colIndex : colIndex + 1;
        console.log(`[${label}] Actual insert index: ${insertIndex}`);
        
        for (let i = 0; i < numOfColumns; i++) {
          insertColumn(ydata, insertIndex + i);
        }
      });
      
      // Reload from Y state to verify
      reloadFromYState(sheet, idx, ysheets);
    };

    // Column deleted
    sheet.options.ondeletecolumn = (instance, colIndex, numOfColumns) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Deleted ${numOfColumns} column(s) at index ${colIndex}`);
      
      ydoc.transact(() => {
        deleteColumn(ydata, colIndex, numOfColumns);
      });
      
      // Reload from Y state to verify
      reloadFromYState(sheet, idx, ysheets);
    };

    // Row moved
    sheet.options.onmoverow = (instance, fromIndex, toIndex) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Moved row from ${fromIndex} to ${toIndex}`);
      
      ydoc.transact(() => {
        moveRow(ydata, fromIndex, toIndex);
      });
      
      // Reload from Y state to verify
      reloadFromYState(sheet, idx, ysheets);
    };

    // Column moved
    sheet.options.onmovecolumn = (instance, fromIndex, toIndex) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Moved column from ${fromIndex} to ${toIndex}`);
      
      ydoc.transact(() => {
        moveColumn(ydata, fromIndex, toIndex);
      });
      
      // Reload from Y state to verify
      reloadFromYState(sheet, idx, ysheets);
    };
  };

  // Setup event handlers for top sheets
  topContainer.jexcel.forEach((sheet, idx) => {
    setupEventHandlers(sheet, idx, ySheetTop.ydoc, ySheetTop.ysheets, 'Top');
  });

  // Setup event handlers for bottom sheets
  bottomContainer.jexcel.forEach((sheet, idx) => {
    setupEventHandlers(sheet, idx, ySheetBottom.ydoc, ySheetBottom.ysheets, 'Bottom');
  });

  // Sync button handler
  syncButton.addEventListener('click', () => {
    console.log('=== Starting Sync ===');
    
    // Set flag to prevent onafterchanges from triggering
    isApplyingSync = true;
    
    try {
      // Encode each document as an update
      const topUpdate = Y.encodeStateAsUpdate(ySheetTop.ydoc);
      const bottomUpdate = Y.encodeStateAsUpdate(ySheetBottom.ydoc);

      console.log('Top update:', topUpdate);
      console.log('Bottom update:', bottomUpdate);
      
      console.log('Top update size:', topUpdate.length);
      console.log('Bottom update size:', bottomUpdate.length);
      
      // Apply updates: top -> bottom, bottom -> top
      Y.applyUpdate(ySheetBottom.ydoc, topUpdate);
      Y.applyUpdate(ySheetTop.ydoc, bottomUpdate);
      
      console.log('Updates applied to Y documents');
      
      // Convert Y documents back to jexcel format
      const syncedTopSheets = yToJSheet(ySheetTop.ysheets);
      const syncedBottomSheets = yToJSheet(ySheetBottom.ysheets);
      
      console.log('Synced top sheets:', syncedTopSheets);
      console.log('Synced bottom sheets:', syncedBottomSheets);
      
      // Update the spreadsheet displays with new data
      topContainer.jexcel.forEach((sheet, idx) => {
        const newData = syncedTopSheets[idx].data;
        sheet.setData(newData);
      });
      
      bottomContainer.jexcel.forEach((sheet, idx) => {
        const newData = syncedBottomSheets[idx].data;
        sheet.setData(newData);
      });
      
      console.log('=== Sync Complete ===');
    } finally {
      // Reset flag after sync is complete
      isApplyingSync = false;
    }
  });
}