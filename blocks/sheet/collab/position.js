export function captureSpreadsheetState(wrapper) {
  const tabs = wrapper.querySelector('da-sheet-tabs');
  if (!tabs) return null;

  const activeIndex = tabs.activeIndex;
  const sheet = tabs.jexcel[activeIndex];

  const state = {
    sheetIdx: activeIndex,
    selection: null,
    editorCell: null,
    editorValue: null
  };
  
  // Capture selection using jSpreadsheet API methods
  const selectedColumns = sheet.getSelectedColumns ? sheet.getSelectedColumns() : null;
  const selectedRows = sheet.getSelectedRows ? sheet.getSelectedRows() : null;
  
  console.log(`Selected columns:`, selectedColumns);
  console.log(`Selected rows:`, selectedRows);
  
  if (selectedColumns && selectedColumns.length > 0 && selectedRows && selectedRows.length > 0) {
    // Columns are already numbers, rows need to extract data-y from DOM elements
    const colIndices = selectedColumns.map(col => parseInt(col)).filter(x => !isNaN(x));
    const rowIndices = selectedRows.map(row => parseInt(row.getAttribute('data-y'))).filter(y => !isNaN(y));
    
    if (colIndices.length > 0 && rowIndices.length > 0) {
      state.selection = {
        x1: Math.min(...colIndices),
        y1: Math.min(...rowIndices),
        x2: Math.max(...colIndices),
        y2: Math.max(...rowIndices)
      };
      console.log(`Captured selection:`, state.selection);
    }
  }
  
  // Capture editor state (if a cell is being edited)
  const editor = sheet.edition;
  if (editor && editor.length > 0) {
    const editorCell = editor[0];
    const x = parseInt(editorCell.getAttribute('data-x'));
    const y = parseInt(editorCell.getAttribute('data-y'));
    state.editorCell = { x, y };
    // Get the current editor input value
    const editorInput = editorCell.querySelector('input');
    if (editorInput) {
      state.editorValue = editorInput.value;
    }
    console.log(`Captured editor at [${x}, ${y}] with value:`, state.editorValue);
  }

  return state;
};

export function restoreSpreadsheetState(wrapper, state) {
  if (!state) return;
  const tabs = wrapper.querySelector('da-sheet-tabs');
  tabs.showSheet(state.sheetIdx);

  const sheet = tabs.jexcel[state.sheetIdx];
  if (!sheet) return;
  
  // Restore selection
  if (state.selection) {
    const { x1, y1, x2, y2 } = state.selection;
    
    // Check if the selection bounds are still valid
    const maxY = sheet.rows.length - 1;
    const maxX = sheet.options.columns.length - 1;
    
    if (x1 <= maxX && y1 <= maxY && x2 <= maxX && y2 <= maxY) {
      // Update selection
      sheet.updateSelectionFromCoords(x1, y1, x2, y2);
      console.log(`Restored selection:`, state.selection);
    } else {
      console.log(`Selection out of bounds, skipping restore`);
    }
  }
  
  // Restore editor state
  if (state.editorCell) {
    const { x, y } = state.editorCell;
    
    // Check if the cell position is still valid
    const maxY = sheet.rows.length - 1;
    const maxX = sheet.options.columns.length - 1;
    
    console.log('restoring editor cell', x, y, maxX, maxY);

    if (x <= maxX && y <= maxY) {
      const cell = sheet.records[y][x];
      if (cell) {
        console.log('restoring editor cell')
        // Open the editor
        setTimeout(() => {
          sheet.openEditor(cell);
          // Restore the editor value if we had captured it
          if (state.editorValue !== null) {
            console.log('Restoring editor value:', state.editorValue);
            const editorInput = cell.querySelector('input');
            if (editorInput) {
              editorInput.value = state.editorValue;
            }
          }
          console.log(`Restored editor at [${x}, ${y}]`);
        }, 0);
      }
    } else {
      console.log(`Editor cell position out of bounds, skipping restore`);
    }
  }
};