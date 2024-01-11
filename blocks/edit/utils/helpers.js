import { origin, hlxOrigin } from '../../shared/constants.js';

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

export default function aem2prose(doc) {
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


// Legacy stuff from title.js

export async function saveToFranklin(path, action) {
  const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
  const aemPath = parts.join('/');

  const url = `${hlxOrigin}/${action}/${owner}/${repo}/main/${aemPath}`
  const resp = await fetch(url, { method: 'POST' });
  if (!resp.ok) console.log('error');
  return resp.json();
}

function toBlockCSSClassNames(text) {
  if (!text) return [];
  const names = [];
  const idx = text.lastIndexOf('(');
  if (idx >= 0) {
    names.push(text.substring(0, idx));
    names.push(...text.substring(idx + 1).split(','));
  } else {
    names.push(text);
  }

  return names.map((name) => name
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, ''))
    .filter((name) => !!name);
}

function convertBlocks(tables) {
  tables.forEach(table => {
    const tbody = table.querySelector(':scope > tbody');
    const rows = tbody ? [...tbody.querySelectorAll(':scope > tr')] : [...table.querySelectorAll(':scope > tr')];
    const nameRow = rows.shift();
    const divs = [...rows].map((row) => {
      const cols = row.querySelectorAll(':scope > td');
      const divs = [...cols].map((col) => {
        const { innerHTML } = col;
        const div = document.createElement('div');
        div.innerHTML = innerHTML;
        return div;
      });
      const div = document.createElement('div');
      div.append(...divs);
      return div;
    });

    const div = document.createElement('div');
    div.className = toBlockCSSClassNames(nameRow.textContent).join(' ');
    div.append(...divs);
    table.parentElement.parentElement.replaceChild(div, table.parentElement);
  });
}

export function cleanHtml() {
  const editor = window.view.root.querySelector('.ProseMirror').cloneNode(true);
  editor.removeAttribute('class');
  editor.removeAttribute('contenteditable');
  editor.removeAttribute('translate');

  const emptyImgs = editor.querySelectorAll('img.ProseMirror-separator');
  emptyImgs.forEach((el) => { el.remove(); });

  const userPointers = editor.querySelectorAll('.ProseMirror-yjs-cursor');
  userPointers.forEach((el) => el.remove());

  const trailingBreaks = editor.querySelectorAll('.ProseMirror-trailingBreak');
  trailingBreaks.forEach((el) => { el.remove(); });

  const tables = editor.querySelectorAll('.tableWrapper > table');
  convertBlocks(tables);

  const html = `<body><main>${editor.outerHTML}</main></body>`;

  return html;
}

async function saveHtml(fullPath) {
  const blob = new Blob([cleanHtml()], { type: 'text/html' });

  const formData = new FormData();
  formData.append('data', blob);

  const opts = { method: 'PUT', body: formData };
  return fetch(fullPath, opts);
}

async function saveJson(fullPath, sheet) {
  const jData = sheet.getData();
  const data = jData.reduce((acc, row, idx) => {
    // Key Row
    if (idx === 0) return acc;
    const rowObj = {};

    row.forEach((value, idx) => {
      if (jData[0][idx]) {
        rowObj[jData[0][idx]] = value;
      }
    });

    if (Object.keys(rowObj).length) acc.push(rowObj);
    return acc;
  }, []);
  const json = { total: data.length, offset: 0, limit: data.length, data, ':type': 'sheet' };
  const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);

  const opts = { method: 'PUT', body: formData };
  return fetch(fullPath, opts);
}

export function saveToDas(pathname, sheet) {
  const suffix = sheet ? '.json' : '.html';
  const fullPath = `${origin}/source${pathname}${suffix}`;

  if (!sheet) return saveHtml(fullPath);
  return saveJson(fullPath, sheet);
}

export function parse(inital) {
  return new DOMParser().parseFromString(inital, 'text/html');
}
