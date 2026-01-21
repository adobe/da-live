import { Y } from 'da-y-wrapper';

const MIN_DIMENSIONS = 20;

/**
 * ================== YJS TO JSHEET ==================
 */

/**
 * Convert Y.XmlFragment structure back to 2D data array
 * Internal helper function - only used in yToJSheet
 * @param {Y.XmlFragment} ydata - Y.XmlFragment containing row elements
 * @returns {Array} - 2D array of cell values
 */
function yToDataArray(ydata) {
  const data = [];
  if (ydata) {
    ydata.forEach((yrow) => {
      // Each yrow is a Y.XmlElement 'row' containing Y.XmlElement 'cell' children
      const row = [];
      yrow.forEach((ycell) => {
        // Get cell value from attribute
        const cellValue = ycell.getAttribute('value') || '';
        row.push(cellValue);
      });
      data.push(row);
    });
  }
  return data;
}

/**
 * Convert Yjs structure back to jSpreadsheet format
 * @param {Y.Array} ysheets - Yjs Array containing sheet data
 * @returns {Array} - Array of sheet objects compatible with jSpreadsheet
 */
export function yToJSheet(ysheets) {
  const sheets = [];
  
  ysheets.forEach((ysheet) => {
    const sheet = {};
    
    // Get basic properties
    sheet.sheetName = ysheet.get('sheetName');
    
    // Get minDimensions - it was wrapped in array, so unwrap it
    const yMinDimensions = ysheet.get('minDimensions');
    if (yMinDimensions && yMinDimensions.length > 0) {
      sheet.minDimensions = yMinDimensions.toArray()[0];
    }
    
    // Convert Y.XmlFragment data back to regular arrays using helper function
    const ydata = ysheet.get('data');
    sheet.data = yToDataArray(ydata);
    
    // Convert Y.Array columns back to regular array of objects
    const ycolumns = ysheet.get('columns');
    sheet.columns = [];
    if (ycolumns) {
      ycolumns.forEach((ycol) => {
        const col = {};
        ycol.forEach((value, key) => {
          col[key] = value;
        });
        sheet.columns.push(col);
      });
    }
    
    sheets.push(sheet);
  });
  
  return sheets;
}

/**
 * ================== JSHEET TO YJS ==================
 */

/**
 * Helper: Convert a row array to Y.XmlElement with cell children
 * @param {Array} row - Row array
 * @returns {Y.XmlElement} - Y.XmlElement 'row' with 'cell' children (value stored as attribute)
 */
function rowToY(row) {
  const yrow = new Y.XmlElement('row');
  row.forEach((cellValue, idx) => {
    const ycell = new Y.XmlElement('cell');
    ycell.setAttribute('value', String(cellValue || ''));
    yrow.insert(idx, [ycell]);
  });

  if (row.length < MIN_DIMENSIONS) {
    for (let i = row.length; i < MIN_DIMENSIONS; i++) {
      const ycell = new Y.XmlElement('cell');
      ycell.setAttribute('value', '');
      yrow.insert(i, [ycell]);
    }
  }

  return yrow;
}

/**
 * Convert a 2D data array to Y.XmlFragment structure (initial population only)
 * Internal helper function - only used for initial conversion in jSheetToY
 * @param {Array} data - 2D array of cell values
 * @param {Y.XmlFragment} ydata - Y.XmlFragment to populate
 */
export function dataArrayToY(data, ydata) {
  // Clear existing data
  if (ydata.length > 0) {
    ydata.delete(0, ydata.length);
  }

  // Populate with new data
  if (data) {
    data.forEach((row, idx) => {
      const yrow = rowToY(row);
      ydata.insert(idx, [yrow]);
    });
  }

  if (data.length < MIN_DIMENSIONS) {
    for (let i = data.length; i < MIN_DIMENSIONS; i++) {
      const yrow = rowToY([]);
      ydata.insert(i, [yrow]);
    }
  }
}

/**
 * Convert jSpreadsheet sheet data to Yjs structure
 * @param {Array} sheets - Array of sheet objects from getSheets()
 * @returns {Object} - Object containing ydoc and ysheets array
 */
export function jSheetToY(sheets, ydoc, deleteExisting = false) {
  ydoc.transact(() => {
    if (deleteExisting) {
      ydoc.getArray('sheets').delete(0, ydoc.getArray('sheets').length);
    }

    const ysheets = ydoc.getArray('sheets');

    sheets.forEach((sheet) => {
      const ysheet = new Y.Map();

      // Set basic properties
      ysheet.set('sheetName', sheet.sheetName);

      // Set minDimensions - wrap in array to push as single element
      const yMinDimensions = new Y.Array();
      if (sheet.minDimensions) {
        yMinDimensions.push([sheet.minDimensions]);
      }
      ysheet.set('minDimensions', yMinDimensions);

      // Convert data array using helper function
      // Data should already be padded by getSheet
      const ydata = new Y.XmlFragment();
      dataArrayToY(sheet.data, ydata);
      ysheet.set('data', ydata);

      // Convert columns array to Y.Array of Y.Maps
      const ycolumns = new Y.Array();
      if (sheet.columns) {
        sheet.columns.forEach((col) => {
          const ycol = new Y.Map();
          Object.entries(col).forEach(([key, value]) => {
            ycol.set(key, value);
          });
          ycolumns.push([ycol]);
        });
      }
      ysheet.set('columns', ycolumns);

      ysheets.push([ysheet]);
    });
  });

  return ydoc.getArray('sheets');
}