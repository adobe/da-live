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
import { getDaAdmin } from '../shared/constants.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

async function getJson() {
  // const admin = getDaAdmin();
  // const demoSheet = `${admin}/source/hannessolo/da-playground/testsheet.json`;

  // const resp = await daFetch(demoSheet);
  // if (!resp.ok) return { ":type": "sheet", "data": [] };

  return { ":type": "sheet", "data": [] };

  // return resp.json();
}

export default async function init(el) {
  const json = await getJson();

  await loadStyle('/deps/jspreadsheet-ce/dist/jspreadsheet.css');
  await loadScript('/deps/jspreadsheet-ce/dist/index.js');
  await loadScript('/deps/jsuites/dist/jsuites.js');

  const sheetsTop = getSheets(json);
  const sheetsBottom = getSheets(json);
  
  // Convert to Yjs structure - create base doc first
  const baseYSheet = jSheetToY(sheetsTop);

  console.log('baseYSheet', baseYSheet);
  
  // Clone the state to create two separate docs with common history
  const baseState = Y.encodeStateAsUpdate(baseYSheet.ydoc);
  
  // Create top doc from base
  const ySheetTop = {
    ydoc: baseYSheet.ydoc,
    ysheets: baseYSheet.ysheets,
    yUndoManager: new Y.UndoManager(baseYSheet.ysheets, {
      trackedOrigins: new Set(['Top']),
    })
  };
  
  // Create bottom doc from base state
  const bottomYDoc = new Y.Doc();
  const ySheetBottom = {
    ydoc: bottomYDoc,
    ysheets: null,
    yUndoManager: null
  };
  Y.applyUpdate(ySheetBottom.ydoc, baseState);
  ySheetBottom.ysheets = ySheetBottom.ydoc.getArray('sheets');
  ySheetBottom.yUndoManager = new Y.UndoManager(ySheetBottom.ysheets, {
    trackedOrigins: new Set(['Bottom']),
  });

  // Flag to prevent infinite loops when applying synced data
  let isApplyingSync = false;

  // Use object to store mutable container references
  const containers = {
    top: document.createElement('div'),
    bottom: document.createElement('div')
  };
  const syncButton = document.createElement('button');

  containers.top.classList.add('da-sheet-top');
  containers.bottom.classList.add('da-sheet-bottom');
  syncButton.textContent = 'Sync Data Between Sheets';
  syncButton.style.cssText = 'margin: 20px; padding: 10px 20px; font-size: 16px; cursor: pointer;';

  el.append(containers.top, syncButton, containers.bottom);

  window.jspreadsheet.tabs(containers.top, sheetsTop);
  window.jspreadsheet.tabs(containers.bottom, sheetsBottom);

  // Helper to reload a spreadsheet container from Y state (destroy and recreate)
  const reloadSpreadsheetFromY = (containerKey, ysheets, ydoc, yUndoManager, label) => {
    isApplyingSync = true;
    try {
      // Convert Y documents back to jexcel format
      const convertedSheets = yToJSheet(ysheets);
      
      console.log(`Reloading ${label} sheets:`, convertedSheets);
      
      // Destroy existing spreadsheets
      if (containers[containerKey].jexcel) {
        containers[containerKey].jexcel.forEach(sheet => {
          if (sheet.destroy) sheet.destroy();
        });
        delete containers[containerKey].jexcel;
      }
      
      // Create new container div to replace the old one
      const newContainer = document.createElement('div');
      newContainer.classList.add(`da-sheet-${containerKey}`);
      
      // Replace old container with new one in the DOM
      containers[containerKey].replaceWith(newContainer);
      
      // Update reference
      containers[containerKey] = newContainer;
      
      // Recreate spreadsheet with converted data
      window.jspreadsheet.tabs(containers[containerKey], convertedSheets);
      
      // Reattach event handlers
      containers[containerKey].jexcel.forEach((sheet, idx) => {
        setupEventHandlers(sheet, idx, ydoc, ysheets, yUndoManager, label);
      });
      
      console.log(`${label} spreadsheet reloaded from Y state`);
    } finally {
      isApplyingSync = false;
    }
  };

  // Helper to setup granular event handlers
  const setupEventHandlers = (sheet, idx, ydoc, ysheets, yUndoManager, label) => {
    const ysheet = ysheets.get(idx);
    const ydata = ysheet.get('data');
    const ycolumns = ysheet.get('columns');

    // Cell value change
    sheet.options.onchange = (instance, cell, colIndex, rowIndex, value) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Cell changed at [${rowIndex}, ${colIndex}] to "${value}"`);
      
      ydoc.transact(() => {
        updateCell(ydata, rowIndex, colIndex, value);
      }, label);
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
      }, label);
    };

    // Row deleted
    sheet.options.ondeleterow = (instance, rowIndex, numOfRows) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Deleted ${numOfRows} row(s) at index ${rowIndex}`);
      
      ydoc.transact(() => {
        deleteRow(ydata, rowIndex, numOfRows);
      }, label);
    };

    // Column inserted
    sheet.options.oninsertcolumn = (instance, colIndex, numOfColumns, colData, insertBefore) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Inserted ${numOfColumns} column(s) at index ${colIndex}, insertBefore: ${insertBefore}`);
      
      ydoc.transact(() => {
        // If insertBefore is false, we want to insert after the selected column
        // so we need to adjust the index
        const insertIndex = insertBefore ? colIndex : colIndex + 1;
        console.log(`[${label}] Actual insert index: ${insertIndex}`);
        
        for (let i = 0; i < numOfColumns; i++) {
          insertColumn(ydata, ycolumns, insertIndex + i);
        }
      }, label);
    };

    // Column deleted
    sheet.options.ondeletecolumn = (instance, colIndex, numOfColumns) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Deleted ${numOfColumns} column(s) at index ${colIndex}`);
      
      ydoc.transact(() => {
        deleteColumn(ydata, ycolumns, colIndex, numOfColumns);
      }, label);
    };

    // Row moved
    sheet.options.onmoverow = (instance, fromIndex, toIndex) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Moved row from ${fromIndex} to ${toIndex}`);
      
      ydoc.transact(() => {
        moveRow(ydata, fromIndex, toIndex);
      }, label);
    };

    // Column moved
    sheet.options.onmovecolumn = (instance, fromIndex, toIndex) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Moved column from ${fromIndex} to ${toIndex}`);
      
      ydoc.transact(() => {
        moveColumn(ydata, ycolumns, fromIndex, toIndex);
      }, label);
    
    };

    sheet.options.onundo = (instance) => {
      console.log(`[${label}] Undo triggered`);
      yUndoManager.undo();
      // Reload spreadsheet from Y state after undo
      const containerKey = label.toLowerCase();
      reloadSpreadsheetFromY(containerKey, ysheets, ydoc, yUndoManager, label);
    };

    sheet.options.onredo = (instance) => {
      console.log(`[${label}] Redo triggered`);
      yUndoManager.redo();
      // Reload spreadsheet from Y state after redo
      const containerKey = label.toLowerCase();
      reloadSpreadsheetFromY(containerKey, ysheets, ydoc, yUndoManager, label);
    };
  };

  // Setup event handlers for top sheets
  containers.top.jexcel.forEach((sheet, idx) => {
    setupEventHandlers(sheet, idx, ySheetTop.ydoc, ySheetTop.ysheets, ySheetTop.yUndoManager, 'Top');
  });

  // Setup event handlers for bottom sheets
  containers.bottom.jexcel.forEach((sheet, idx) => {
    setupEventHandlers(sheet, idx, ySheetBottom.ydoc, ySheetBottom.ysheets, ySheetBottom.yUndoManager, 'Bottom');
  });

  // Sync button handler
  syncButton.addEventListener('click', () => {
    // Set flag to prevent onafterchanges from triggering
    isApplyingSync = true;
    
    try {
      // Encode each document as an update
      const topUpdate = Y.encodeStateAsUpdate(ySheetTop.ydoc);
      const bottomUpdate = Y.encodeStateAsUpdate(ySheetBottom.ydoc);

      console.log('Top update:', topUpdate);
      console.log('Bottom update:', bottomUpdate);
      
      // Apply updates: top -> bottom, bottom -> top
      Y.applyUpdate(ySheetBottom.ydoc, topUpdate);
      Y.applyUpdate(ySheetTop.ydoc, bottomUpdate);
      
      console.log('Updates applied to Y documents');
      
      // Reload both spreadsheets from their Y state
      reloadSpreadsheetFromY('top', ySheetTop.ysheets, ySheetTop.ydoc, ySheetTop.yUndoManager, 'Top');
      reloadSpreadsheetFromY('bottom', ySheetBottom.ysheets, ySheetBottom.ydoc, ySheetBottom.yUndoManager, 'Bottom');
      
      console.log('=== Sync Complete ===');
    } finally {
      // Reset flag after sync is complete
      isApplyingSync = false;
    }
  });
}