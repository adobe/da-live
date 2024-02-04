import { parseDom } from './helpers.js';

const HEADING_NAMES = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
const AEM_ORIGIN = ['hlx.page', 'hlx.live', 'aem.page', 'aem.live'];

function decorateImages(element, path) {
  if (!element || !path) return;
  try {
    const url = new URL(path);
    element.querySelectorAll('img').forEach((img) => {
      const srcSplit = img.src.split('/');
      const mediaPath = srcSplit.pop();
      // img.src = `${url.origin}/${mediaPath}`;
      const { width, height } = img;
      const ratio = width > 200 ? 200 / width : 1;
      img.width = width * ratio;
      img.height = height * ratio;
    });
  } catch (e) {
    // leave images as is
  }
}

function getBlockName(className) {
  const classes = className.split(' ');
  const name = classes.shift();
  const names = { name };
  if (classes.length > 0) {
    names.variants = classes.join(', ');
  }
  return names;
}

function getBlockHtml(block) {
  const { name, variants } = getBlockName(block.className);
  const rows = [...block.children];
  const maxCols = rows.reduce((cols, row) => (
    row.children.length > cols ? row.children.length : cols), 0);
  const table = document.createElement('table');
  table.setAttribute('border', 1);
  const headerRow = document.createElement('tr');

  const th = document.createElement('td');
  th.setAttribute('colspan', maxCols);
  th.textContent = variants ? `${name} (${variants})` : name;

  headerRow.append(th);
  table.append(headerRow);
  rows.forEach((row) => {
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
  });
  return table;
}

export async function getBlockVariants(path) {
  const { origin } = new URL(path);
  const isAemHosted = AEM_ORIGIN.some((aemOrigin) => origin.endsWith(aemOrigin));
  const postfix = isAemHosted ? '.plain.html' : '';

  const resp = await fetch(`${path}${postfix}`);
  if (!resp.ok) return [];

  const ul = document.createElement('ul');
  ul.className = 'da-library-item-list-group';

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.body.querySelectorAll('.library-metadata').forEach((block) => {
    block.remove();
  });

  decorateImages(doc.body, path);

  // plain.html format will not have a main element
  // content pulled directly from DA will have a main element
  // these shouldn't collect duplicates for the different scenarios
  const blocks = doc.querySelectorAll('body > div > div, main > div > div');

  return [...blocks].map((block) => {
    const prevSib = block.previousElementSibling;
    const prevName = prevSib?.nodeName;

    const override = HEADING_NAMES.some((name) => prevName === name);
    const item = override && prevSib.textContent
      ? { name: prevSib.textContent } : getBlockName(block.className);
    const dom = getBlockHtml(block);
    item.parsed = parseDom(dom);
    return item;
  });
}

export async function getBlocks(sources) {
  const sourcesData = sources.map(
    (url) => fetch(url).then((resp) => {
      if (!resp.ok) throw new Error('Something went wrong.');
      return resp.json();
    }).catch(() => {}),
  );

  return Promise.all(sourcesData)
    .then((resData) => {
      const blockList = [];
      resData.forEach(async (blockData) => {
        const { data } = blockData.blocks || blockData;
        if (!data) return;
        data.forEach((block) => {
          if (block.name && block.path) blockList.push(block);
        });
      });
      return blockList;
    });
}
