import { getLibs } from '../../../scripts/utils.js';
const { loadScript, loadStyle } = await import(`${getLibs()}/utils/utils.js`);

export default async function init(el, data) {
  await loadStyle('/deps/jspreadsheet-ce/dist/jspreadsheet.css');
  await loadScript('/deps/jspreadsheet-ce/dist/index.js');
  await loadScript('/deps/jsuites/dist/jsuites.js');

  // A very minimal column config to set widths if there's data.
  // Not clever enough to detect how wide a column should be.
  const columns = data[0].map((col) => {
    return { width: '200px' };
  });

  return window.jspreadsheet(el, {
    data,
    minSpareCols: 10,
    minSpareRows: 10,
    columns,
  });

}
