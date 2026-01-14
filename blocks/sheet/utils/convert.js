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