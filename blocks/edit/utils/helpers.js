import { AEM_ORIGIN, getDaAdmin } from '../../shared/constants.js';
import prose2aem from '../../shared/prose2aem.js';
import { daFetch } from '../../shared/utils.js';

const DA_ORIGIN = getDaAdmin();

function getBlockName(block) {
  const classes = block.className.split(' ');
  const name = classes.shift();
  return classes.length > 0 ? `${name} (${classes.join(', ')})` : name;
}

function handleRow(row, maxCols, table) {
  const tr = document.createElement('tr');
  const cells = [...row.children];
  cells.forEach((cell, idx) => {
    const td = document.createElement('td');
    if (cells.length < maxCols && idx === cells.length - 1) {
      td.setAttribute('colspan', maxCols - idx);
    }
    td.innerHTML = cells[idx].innerHTML;
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
  const blocks = doc.querySelectorAll('main > div > div, da-loc-deleted > div, da-loc-added > div, da-loc-deleted.da-group > div > div, da-loc-added.da-group > div > div');
  blocks.forEach((block) => {
    if (block.className?.includes('loc-')) return;
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
  const resp = await daFetch(url, { method: 'POST' });
  // eslint-disable-next-line no-console
  if (!resp.ok) {
    const { status } = resp;
    const message = [401, 403].some((s) => s === status) ? 'Not authorized to' : 'Error during';
    return {
      error: {
        status,
        type: 'error',
        message,
      },
    };
  }
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

function formatSheetData(sheet) {
  const jData = sheet.getData();

  const data = jData.reduce((acc, row, idx) => {
    if (idx > 0) {
      const rowObj = {};
      row.forEach((value, rowIdx) => {
        if (jData[0][rowIdx]) {
          rowObj[jData[0][rowIdx]] = value;
        }
      });
      acc.push(rowObj);
    }
    return acc;
  }, []);

  // Remove trailing empty rows - leave one data row if all data is empty
  while (data.length > 1 && !Object.values(data.slice(-1)[0]).some(Boolean)) {
    data.pop();
  }

  return data;
}

async function saveJson(fullPath, sheets, dataType = 'blob') {
  let json;
  const formatted = sheets.reduce((acc, sheet) => {
    const data = formatSheetData(sheet);
    acc[sheet.name] = {
      total: data.length,
      limit: data.length,
      offset: 0,
      data,
    };
    return acc;
  }, {});

  if (sheets.length > 1) {
    formatted[':names'] = sheets.map((sheet) => sheet.name);
    formatted[':version'] = 3;
    formatted[':type'] = 'multi-sheet';
    json = formatted;
  } else {
    json = formatted[sheets[0].name];
    json[':type'] = 'sheet';
  }

  const formData = new FormData();

  if (dataType === 'blob') {
    const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
    formData.append('data', blob);
  }

  if (dataType === 'config') {
    formData.append('config', JSON.stringify(json));
  }

  const opts = { method: 'PUT', body: formData };
  return daFetch(fullPath, opts);
}

export function saveToDa(pathname, sheet) {
  const suffix = sheet ? '.json' : '.html';
  const fullPath = `${DA_ORIGIN}/source${pathname}${suffix}`;

  if (!sheet) return saveHtml(fullPath);
  return saveJson(fullPath, sheet);
}

export function saveDaConfig(pathname, sheet) {
  const fullPath = `${DA_ORIGIN}/config${pathname}`;
  return saveJson(fullPath, sheet, 'config');
}

export async function saveDaVersion(pathname, ext = 'html') {
  const fullPath = `${DA_ORIGIN}/versionsource${pathname}.${ext}`;

  const opts = {
    method: 'POST',
    body: JSON.stringify({ label: 'Published' }),
  };

  try {
    await daFetch(fullPath, opts);
  } catch {
    console.log('Error creating auto version on publish.');
  }
}

export function parse(inital) {
  return new DOMParser().parseFromString(inital, 'text/html');
}
