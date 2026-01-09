import { Y } from '/deps/da-y-wrapper/dist/index.js';

const MIN_DIMENSIONS = 4;
const SHEET_TEMPLATE = { minDimensions: [MIN_DIMENSIONS, MIN_DIMENSIONS], sheetName: 'data' };

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

function getSheet(json, sheetName) {
  const data = getSheetData(json.data);
  const templ = { ...SHEET_TEMPLATE };
  
  // Ensure data is padded to minDimensions
  const [minRows, minCols] = templ.minDimensions;
  
  // Pad rows
  while (data.length < minRows) {
    data.push([]);
  }
  
  // Pad columns in each row
  for (let i = 0; i < data.length; i++) {
    while (data[i].length < minCols) {
      data[i].push('');
    }
  }
  
  // Create columns array that matches the data width
  const numColumns = Math.max(minCols, data[0]?.length || 0);

  return {
    ...templ,
    sheetName,
    data,
    columns: new Array(numColumns).fill(null).map(() => ({ width: '300' })),
  };
}

export function getSheets(json) {
  const sheets = [];

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

/**
 * Helper: Extract text from Y.Text or return plain value
 * @param {*} cell - Y.Text object or plain value
 * @returns {string} - String representation of the cell
 */
function getCellText(cell) {
  if (cell && typeof cell.toString === 'function' && cell._start !== undefined) {
    // It's a Y.Text object
    return cell.toString();
  }
  return cell || '';
}

/**
 * Helper: Convert a row array to Y.Array with Y.Text cells
 * @param {Array} row - Row array
 * @returns {Y.Array} - Y.Array representation of the row with Y.Text cells
 */
function rowToY(row) {
  const yrow = new Y.Array();
  row.forEach((cell) => {
    const ytext = new Y.Text();
    ytext.insert(0, String(cell || ''));
    yrow.push([ytext]);
  });
  return yrow;
}

/**
 * Helper: Update a Y.Text cell with new content
 * @param {Y.Text} ytext - Y.Text object to update
 * @param {string} newValue - New value to set
 */
function updateYTextCell(ytext, newValue) {
  const currentText = ytext.toString();
  const newText = String(newValue || '');
  
  if (currentText === newText) return;
  
  // Delete old content and insert new
  if (currentText.length > 0) {
    ytext.delete(0, currentText.length);
  }
  if (newText.length > 0) {
    ytext.insert(0, newText);
  }
}

/**
 * Convert a 2D data array to Y.Array structure (initial population only)
 * Internal helper function - only used for initial conversion in jSheetToY
 * @param {Array} data - 2D array of cell values
 * @param {Y.Array} ydata - Y.Array to populate
 */
function dataArrayToY(data, ydata) {
  // Clear existing data
  if (ydata.length > 0) {
    ydata.delete(0, ydata.length);
  }
  
  // Populate with new data
  if (data) {
    data.forEach((row) => {
      const yrow = rowToY(row);
      ydata.push([yrow]);
    });
  }
}

/**
 * Convert Y.Array structure back to 2D data array
 * Internal helper function - only used in yToJSheet
 * @param {Y.Array} ydata - Y.Array containing row data
 * @returns {Array} - 2D array of cell values
 */
function yToDataArray(ydata) {
  const data = [];
  if (ydata) {
    ydata.forEach((yrow) => {
      // Each yrow is a Y.Array containing Y.Text cells
      const yCells = yrow.toArray();
      const row = yCells.map(cell => getCellText(cell));
      data.push(row);
    });
  }
  return data;
}

// ============================================================================
// Granular Y.Array Update Functions
// ============================================================================

/**
 * Update a specific cell's Y.Text value
 * @param {Y.Array} ydata - Y.Array containing rows
 * @param {number} rowIndex - Row index
 * @param {number} colIndex - Column index
 * @param {string} newValue - New cell value
 */
export function updateCell(ydata, rowIndex, colIndex, newValue) {
  if (rowIndex < 0 || rowIndex >= ydata.length) {
    console.warn(`Row index ${rowIndex} out of bounds`);
    return;
  }
  
  const yrow = ydata.get(rowIndex);
  if (!yrow) {
    console.warn(`No row at index ${rowIndex}`);
    return;
  }
  
  const yCells = yrow.toArray();
  if (colIndex < 0 || colIndex >= yCells.length) {
    console.warn(`Column index ${colIndex} out of bounds`);
    return;
  }
  
  const yCell = yCells[colIndex];
  if (yCell && typeof yCell.toString === 'function' && yCell._start !== undefined) {
    // It's a Y.Text, update it
    updateYTextCell(yCell, newValue);
    console.log(`Updated cell [${rowIndex}, ${colIndex}] to "${newValue}"`);
  } else {
    console.warn(`Cell at [${rowIndex}, ${colIndex}] is not a Y.Text`);
  }
}

/**
 * Insert a new row at the specified index
 * @param {Y.Array} ydata - Y.Array containing rows
 * @param {number} rowIndex - Index where to insert the row
 * @param {Array} rowData - Array of cell values for the new row (optional)
 * @param {number} numColumns - Number of columns (used if rowData not provided)
 */
export function insertRow(ydata, rowIndex, rowData = null, numColumns = 0) {
  const newRow = new Y.Array();
  
  if (rowData) {
    // Create row from provided data
    rowData.forEach((cell) => {
      const ytext = new Y.Text();
      ytext.insert(0, String(cell || ''));
      newRow.push([ytext]);
    });
  } else {
    // Create empty row with specified number of columns
    for (let i = 0; i < numColumns; i++) {
      const ytext = new Y.Text();
      ytext.insert(0, '');
      newRow.push([ytext]);
    }
  }
  
  ydata.insert(rowIndex, [newRow]);
  console.log(`Inserted row at index ${rowIndex}`);
}

/**
 * Delete a row at the specified index
 * @param {Y.Array} ydata - Y.Array containing rows
 * @param {number} rowIndex - Index of the row to delete
 * @param {number} count - Number of rows to delete (default 1)
 */
export function deleteRow(ydata, rowIndex, count = 1) {
  if (rowIndex < 0 || rowIndex >= ydata.length) {
    console.warn(`Row index ${rowIndex} out of bounds`);
    return;
  }
  
  ydata.delete(rowIndex, count);
  console.log(`Deleted ${count} row(s) at index ${rowIndex}`);
}

/**
 * Insert a column at the specified index
 * @param {Y.Array} ydata - Y.Array containing rows
 * @param {Y.Array} ycolumns - Y.Array containing column metadata
 * @param {number} colIndex - Index where to insert the column
 * @param {Array} columnData - Array of cell values for the new column (optional)
 */
export function insertColumn(ydata, ycolumns, colIndex, columnData = null) {
  // Insert data cells in each row
  ydata.forEach((yrow, rowIdx) => {
    const ytext = new Y.Text();
    const value = columnData && columnData[rowIdx] ? columnData[rowIdx] : '';
    ytext.insert(0, String(value));
    yrow.insert(colIndex, [ytext]);
  });
  
  // Insert column metadata
  const ycol = new Y.Map();
  ycol.set('width', '300');
  ycolumns.insert(colIndex, [ycol]);
  
  console.log(`Inserted column at index ${colIndex} (data and metadata)`);
}

/**
 * Delete a column at the specified index
 * @param {Y.Array} ydata - Y.Array containing rows
 * @param {Y.Array} ycolumns - Y.Array containing column metadata
 * @param {number} colIndex - Index of the column to delete
 * @param {number} count - Number of columns to delete (default 1)
 */
export function deleteColumn(ydata, ycolumns, colIndex, count = 1) {
  // Delete data cells from each row
  ydata.forEach((yrow) => {
    const yCells = yrow.toArray();
    if (colIndex >= 0 && colIndex < yCells.length) {
      yrow.delete(colIndex, count);
    }
  });
  
  // Delete column metadata
  if (colIndex >= 0 && colIndex < ycolumns.length) {
    ycolumns.delete(colIndex, count);
  }
  
  console.log(`Deleted ${count} column(s) at index ${colIndex} (data and metadata)`);
}

/**
 * Move a row from one position to another
 * @param {Y.Array} ydata - Y.Array containing rows
 * @param {number} fromIndex - Source row index
 * @param {number} toIndex - Destination row index
 */
export function moveRow(ydata, fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= ydata.length) {
    console.warn(`Source row index ${fromIndex} out of bounds`);
    return;
  }
  if (toIndex < 0 || toIndex >= ydata.length) {
    console.warn(`Destination row index ${toIndex} out of bounds`);
    return;
  }
  
  // Get the row to move
  const rowToMove = ydata.get(fromIndex);
  
  // Delete from original position
  ydata.delete(fromIndex, 1);
  
  // Insert at new position (adjust index if moving down)
  const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  ydata.insert(adjustedToIndex, [rowToMove]);
  
  console.log(`Moved row from index ${fromIndex} to ${adjustedToIndex}`);
}

/**
 * Move a column from one position to another
 * @param {Y.Array} ydata - Y.Array containing rows
 * @param {Y.Array} ycolumns - Y.Array containing column metadata
 * @param {number} fromIndex - Source column index
 * @param {number} toIndex - Destination column index
 */
export function moveColumn(ydata, ycolumns, fromIndex, toIndex) {
  // Move data cells in each row
  ydata.forEach((yrow) => {
    const yCells = yrow.toArray();
    
    if (fromIndex < 0 || fromIndex >= yCells.length) {
      console.warn(`Source column index ${fromIndex} out of bounds`);
      return;
    }
    if (toIndex < 0 || toIndex >= yCells.length) {
      console.warn(`Destination column index ${toIndex} out of bounds`);
      return;
    }
    
    // Get the cell to move
    const cellToMove = yCells[fromIndex];
    
    // Delete from original position
    yrow.delete(fromIndex, 1);
    
    // Insert at new position (adjust index if moving right)
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    yrow.insert(adjustedToIndex, [cellToMove]);
  });
  
  // Move column metadata
  if (fromIndex >= 0 && fromIndex < ycolumns.length && toIndex >= 0 && toIndex < ycolumns.length) {
    const colToMove = ycolumns.get(fromIndex);
    ycolumns.delete(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    ycolumns.insert(adjustedToIndex, [colToMove]);
  }
  
  console.log(`Moved column from index ${fromIndex} to ${toIndex} (data and metadata)`);
}

/**
 * Convert jSpreadsheet sheet data to Yjs structure
 * @param {Array} sheets - Array of sheet objects from getSheets()
 * @returns {Object} - Object containing ydoc and ysheets array
 */
export function jSheetToY(sheets) {
  const ydoc = new Y.Doc();
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
    const ydata = new Y.Array();
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

  return { ydoc, ysheets };
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
    
    // Convert Y.Array data back to regular arrays using helper function
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

