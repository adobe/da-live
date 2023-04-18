const { getLibs } = await import('../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);

function getBlockName(block) {
  const classes = block.className.split(' ');
  const name = classes.shift();
  return classes.length > 0 ? `${name} (${classes.join(', ')})` : name;
}

function handleRow(row, maxCols, table) {
  const tr = document.createElement('tr');
  [...row.children].forEach((col) => {
    const td = document.createElement('td');
    if (row.children.length < maxCols) {
      td.setAttribute('colspan', maxCols);
    }
    td.innerHTML = col.innerHTML;
    tr.append(td);
  });
  table.append(tr);
}

export function getTable(block) {
  const name = getBlockName(block);
  const rows = [...block.children];
  const maxCols = rows.reduce((cols, row) => (
    row.children.length > cols ? row.children.length : cols), 0);
  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  headerRow.append(createTag('th', { colspan: maxCols }, name));
  table.append(headerRow);
  rows.forEach((row) => {
    handleRow(row, maxCols, table);
  });
  return table;
}
