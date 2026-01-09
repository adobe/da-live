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
  const admin = getDaAdmin();
  const demoSheet = `${admin}/source/hannessolo/da-playground/testsheet.json`;

  const resp = await daFetch(demoSheet);
  if (!resp.ok) return { ":type": "sheet", "data": [] };

  return resp.json();
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

  // Helper to reload sheet from Y state
  const reloadFromYState = (sheet, idx, ysheets) => {
    isApplyingSync = true;
    try {
      const convertedSheets = yToJSheet(ysheets);
      const sheetData = convertedSheets[idx].data;
      sheet.setData(sheetData);
      console.log(`Reloaded sheet ${idx} from Y state`);
    } finally {
      isApplyingSync = false;
    }
  };

  // Helper to setup granular event handlers
  const setupEventHandlers = (sheet, idx, ydoc, ysheets, label) => {
    const ysheet = ysheets.get(idx);
    const ydata = ysheet.get('data');
    const ycolumns = ysheet.get('columns');

    // Cell value change
    sheet.options.onchange = (instance, cell, colIndex, rowIndex, value) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Cell changed at [${rowIndex}, ${colIndex}] to "${value}"`);
      
      ydoc.transact(() => {
        updateCell(ydata, rowIndex, colIndex, value);
      });
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
    };

    // Row deleted
    sheet.options.ondeleterow = (instance, rowIndex, numOfRows) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Deleted ${numOfRows} row(s) at index ${rowIndex}`);
      
      ydoc.transact(() => {
        deleteRow(ydata, rowIndex, numOfRows);
      });
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
      });
    };

    // Column deleted
    sheet.options.ondeletecolumn = (instance, colIndex, numOfColumns) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Deleted ${numOfColumns} column(s) at index ${colIndex}`);
      
      ydoc.transact(() => {
        deleteColumn(ydata, ycolumns, colIndex, numOfColumns);
      });
    };

    // Row moved
    sheet.options.onmoverow = (instance, fromIndex, toIndex) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Moved row from ${fromIndex} to ${toIndex}`);
      
      ydoc.transact(() => {
        moveRow(ydata, fromIndex, toIndex);
      });
    };

    // Column moved
    sheet.options.onmovecolumn = (instance, fromIndex, toIndex) => {
      if (isApplyingSync) return;
      console.log(`[${label}] Moved column from ${fromIndex} to ${toIndex}`);
      
      ydoc.transact(() => {
        moveColumn(ydata, ycolumns, fromIndex, toIndex);
      });
    
    };

    sheet.options.onafterchanges = (instance, changes) => {
      console.log(`[${label}] After changes:`, changes);
      reloadFromYState(sheet, idx, ysheets);
    };
  };

  // Setup event handlers for top sheets
  containers.top.jexcel.forEach((sheet, idx) => {
    setupEventHandlers(sheet, idx, ySheetTop.ydoc, ySheetTop.ysheets, 'Top');
  });

  // Setup event handlers for bottom sheets
  containers.bottom.jexcel.forEach((sheet, idx) => {
    setupEventHandlers(sheet, idx, ySheetBottom.ydoc, ySheetBottom.ysheets, 'Bottom');
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
      
      // Convert Y documents back to jexcel format
      const syncedTopSheets = yToJSheet(ySheetTop.ysheets);
      const syncedBottomSheets = yToJSheet(ySheetBottom.ysheets);
      
      console.log('Synced top sheets:', syncedTopSheets);
      console.log('Synced bottom sheets:', syncedBottomSheets);
      
      // Destroy existing spreadsheets
      if (containers.top.jexcel) {
        containers.top.jexcel.forEach(sheet => {
          if (sheet.destroy) sheet.destroy();
        });
        delete containers.top.jexcel;
      }
      
      if (containers.bottom.jexcel) {
        containers.bottom.jexcel.forEach(sheet => {
          if (sheet.destroy) sheet.destroy();
        });
        delete containers.bottom.jexcel;
      }
      
      // Create new container divs to replace the old ones
      const newTopContainer = document.createElement('div');
      newTopContainer.classList.add('da-sheet-top');
      
      const newBottomContainer = document.createElement('div');
      newBottomContainer.classList.add('da-sheet-bottom');
      
      // Replace old containers with new ones in the DOM
      containers.top.replaceWith(newTopContainer);
      containers.bottom.replaceWith(newBottomContainer);
      
      // Update references
      containers.top = newTopContainer;
      containers.bottom = newBottomContainer;
      
      // Recreate spreadsheets with synced data
      window.jspreadsheet.tabs(containers.top, syncedTopSheets);
      window.jspreadsheet.tabs(containers.bottom, syncedBottomSheets);
      
      // Reattach event handlers
      containers.top.jexcel.forEach((sheet, idx) => {
        setupEventHandlers(sheet, idx, ySheetTop.ydoc, ySheetTop.ysheets, 'Top');
      });
      
      containers.bottom.jexcel.forEach((sheet, idx) => {
        setupEventHandlers(sheet, idx, ySheetBottom.ydoc, ySheetBottom.ysheets, 'Bottom');
      });
      
      console.log('=== Sync Complete ===');
    } finally {
      // Reset flag after sync is complete
      isApplyingSync = false;
    }
  });
}