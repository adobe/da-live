import { DA_ORIGIN, AEM_ORIGIN } from '../../shared/constants.js';
import prose2aem from '../../shared/prose2aem.js';
import { daFetch } from '../../shared/utils.js';

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

  const td = document.createElement('td');
  td.setAttribute('colspan', maxCols);
  td.append(name);

  headerRow.append(td);
  table.append(headerRow);
  rows.forEach((row) => { handleRow(row, maxCols, table); });
  return table;
}

function para() {
  return document.createElement('p');
}

export function aem2prose(doc) {
  // Fix BRs
  const brs = doc.querySelectorAll('p br');
  brs.forEach((br) => { br.remove(); });

  // Fix blocks
  const blocks = doc.querySelectorAll('div[class]');
  blocks.forEach((block) => {
    const table = getTable(block);
    block.parentElement.replaceChild(table, block);
    table.insertAdjacentElement('beforebegin', para());
    table.insertAdjacentElement('afterend', para());
  });

  // Fix pictures
  const imgs = doc.querySelectorAll('picture img');
  imgs.forEach((img) => {
    const pic = img.closest('picture');
    pic.parentElement.replaceChild(img, pic);
  });

  // Fix three dashes
  const paras = doc.querySelectorAll('p');
  paras.forEach((p) => {
    if (p.textContent.trim() === '---') {
      const hr = document.createElement('hr');
      p.parentElement.replaceChild(hr, p);
    }
  });

  // Fix sections
  const sections = doc.body.querySelectorAll('main > div');
  return [...sections].map((section, idx) => {
    const fragment = new DocumentFragment();
    if (idx > 0) {
      const hr = document.createElement('hr');
      fragment.append(para(), hr, para());
    }
    fragment.append(...section.querySelectorAll(':scope > *'));
    return fragment;
  });
}

export async function saveToAem(path, action) {
  const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
  const aemPath = parts.join('/');

  const url = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const resp = await fetch(url, { method: 'POST' });
  // eslint-disable-next-line no-console
  if (!resp.ok) console.log('error');
  return resp.json();
}

async function saveHtml(fullPath) {
  const editor = window.view.root.querySelector('.ProseMirror').cloneNode(true);
  const html = prose2aem(editor, false);
  const blob = new Blob([html], { type: 'text/html' });

  const formData = new FormData();
  formData.append('data', blob);

  const opts = { method: 'PUT', body: formData };
  return daFetch(fullPath, opts);
}

async function saveJson(fullPath, sheet) {
  const jData = sheet.getData();
  const data = jData.reduce((acc, row, idx) => {
    // Key Row
    if (idx === 0) return acc;
    const rowObj = {};

    row.forEach((value, rowIdx) => {
      if (jData[0][rowIdx]) {
        rowObj[jData[0][rowIdx]] = value;
      }
    });

    // Remove fully empty valued rows
    const filled = Object.keys(rowObj).some((key) => rowObj[key]);

    if (Object.keys(rowObj).length && filled) acc.push(rowObj);
    return acc;
  }, []);
  const json = { total: data.length, offset: 0, limit: data.length, data, ':type': 'sheet' };
  const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);

  const opts = { method: 'PUT', body: formData };
  return daFetch(fullPath, opts);
}

export function saveToDa(pathname, sheet) {
  const suffix = sheet ? '.json' : '.html';
  const fullPath = `${DA_ORIGIN}/source${pathname}${suffix}`;

  if (!sheet) return saveHtml(fullPath);
  return saveJson(fullPath, sheet);
}

export function parse(inital) {
  return new DOMParser().parseFromString(inital, 'text/html');
}
