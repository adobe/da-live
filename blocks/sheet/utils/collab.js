import { Y } from 'da-y-wrapper';

/**
 * Update a specific cell's value (sets attribute - last-write-wins)
 * @param {Y.XmlFragment} ydata - Y.XmlFragment containing row elements
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
  
  if (colIndex < 0 || colIndex >= yrow.length) {
    console.warn(`Column index ${colIndex} out of bounds`);
    return;
  }
  
  // Get the Y.XmlElement 'cell' and set its value attribute (last-write-wins)
  const ycell = yrow.get(colIndex);
  if (!ycell) {
    console.warn(`No cell at [${rowIndex}, ${colIndex}]`);
    return;
  }
  
  ycell.setAttribute('value', String(newValue || ''));
  
  console.log(`Updated cell [${rowIndex}, ${colIndex}] to "${newValue}"`);
}

/**
 * Insert a new row at the specified index
 * @param {Y.XmlFragment} ydata - Y.XmlFragment containing row elements
 * @param {number} rowIndex - Index where to insert the row
 * @param {Array} rowData - Array of cell values for the new row (optional)
 * @param {number} numColumns - Number of columns (used if rowData not provided)
 */
export function insertRow(ydata, rowIndex, rowData = null, numColumns = 0) {
  const yrow = new Y.XmlElement('row');
  
  if (rowData) {
    // Create row from provided data
    rowData.forEach((cellValue, idx) => {
      const ycell = new Y.XmlElement('cell');
      ycell.setAttribute('value', String(cellValue || ''));
      yrow.insert(idx, [ycell]);
    });
  } else {
    // Create empty row with specified number of columns
    for (let i = 0; i < numColumns; i++) {
      const ycell = new Y.XmlElement('cell');
      ycell.setAttribute('value', '');
      yrow.insert(i, [ycell]);
    }
  }
  
  ydata.insert(rowIndex, [yrow]);
  console.log(`Inserted row at index ${rowIndex}`);
}

/**
 * Delete a row at the specified index
 * @param {Y.XmlFragment} ydata - Y.XmlFragment containing row elements
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
 * @param {Y.XmlFragment} ydata - Y.XmlFragment containing row elements
 * @param {Y.Array} ycolumns - Y.Array containing column metadata
 * @param {number} colIndex - Index where to insert the column
 * @param {Array} columnData - Array of cell values for the new column (optional)
 */
export function insertColumn(ydata, ycolumns, colIndex, columnData = null) {
  // Insert data cells in each row
  ydata.forEach((yrow, rowIdx) => {
    const value = columnData && columnData[rowIdx] ? columnData[rowIdx] : '';
    const ycell = new Y.XmlElement('cell');
    ycell.setAttribute('value', String(value));
    yrow.insert(colIndex, [ycell]);
  });
  
  // Insert column metadata
  const ycol = new Y.Map();
  ycol.set('width', '300');
  ycolumns.insert(colIndex, [ycol]);
  
  console.log(`Inserted column at index ${colIndex} (data and metadata)`);
}

/**
 * Delete a column at the specified index
 * @param {Y.XmlFragment} ydata - Y.XmlFragment containing row elements
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
 * @param {Y.XmlFragment} ydata - Y.XmlFragment containing row elements
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
 * @param {Y.XmlFragment} ydata - Y.XmlFragment containing row elements
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

export function setupEventHandlers(sheet, idx,ydoc, ysheets, yUndoManager, label) {
  const ysheet = ysheets.get(idx);
  const ydata = ysheet.get('data');
  const ycolumns = ysheet.get('columns');

  // Cell value change
  sheet.options.onchange = (instance, cell, colIndex, rowIndex, value) => {
    console.log(`[${label}] Cell changed at [${rowIndex}, ${colIndex}] to "${value}"`);
    
    ydoc.transact(() => {
      updateCell(ydata, rowIndex, colIndex, value);
    }, label);
  };

  // Row inserted
  sheet.options.oninsertrow = (instance, rowIndex, numOfRows, rowData, insertBefore) => {
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
    console.log(`[${label}] Deleted ${numOfRows} row(s) at index ${rowIndex}`);
    
    ydoc.transact(() => {
      deleteRow(ydata, rowIndex, numOfRows);
    }, label);
  };

  // Column inserted
  sheet.options.oninsertcolumn = (instance, colIndex, numOfColumns, colData, insertBefore) => {
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
    console.log(`[${label}] Deleted ${numOfColumns} column(s) at index ${colIndex}`);
    
    ydoc.transact(() => {
      deleteColumn(ydata, ycolumns, colIndex, numOfColumns);
    }, label);
  };

  // Row moved
  sheet.options.onmoverow = (instance, fromIndex, toIndex) => {
    console.log(`[${label}] Moved row from ${fromIndex} to ${toIndex}`);
    
    ydoc.transact(() => {
      moveRow(ydata, fromIndex, toIndex);
    }, label);
  };

  // Column moved
  sheet.options.onmovecolumn = (instance, fromIndex, toIndex) => {
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