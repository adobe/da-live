import { AEM_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import { sanitizePathParts } from '../../../../scripts/utils.js';
import prose2aem from '../../shared/prose2aem.js';
import { daFetch } from '../../shared/utils.js';

export function isURL(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

const AEM_PERMISSION_TPL = '{"users":{"total":1,"limit":1,"offset":0,"data":[]},"data":{"total":1,"limit":1,"offset":0,"data":[{}]},":names":["users","data"],":version":3,":type":"multi-sheet"}';

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
  brs.forEach((br) => br.remove());

  // Els with da-diff-added property get wrapped in the da-diff-added element
  const diffAddedEls = doc.querySelectorAll('[da-diff-added]');
  diffAddedEls.forEach((el) => {
    const div = document.createElement('da-diff-added');
    div.setAttribute('da-diff-added', '');
    if (el.classList.contains('block-group-start')) {
      div.className = 'da-group';
    }
    el.parentElement.insertBefore(div, el);
    div.appendChild(el);
  });

  // Fix blocks
  const blocks = doc.querySelectorAll('main > div > div, da-diff-deleted > div, da-diff-added > div, da-diff-deleted.da-group > div > div, da-diff-added.da-group > div > div');
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

  // Fix da-diff-* list items
  const lis = doc.querySelectorAll('main > div > :is(ul, ol) > :is(da-diff-added, da-diff-deleted)');
  lis.forEach((li) => {
    const isDiffDeleted = li.nodeName === 'DA-DIFF-DELETED';
    const isDiffAdded = li.nodeName === 'DA-DIFF-ADDED';

    if (!isDiffDeleted && !isDiffAdded) return;

    if (isDiffDeleted && li.firstChild?.nodeName === 'LI' && li.firstChild.children.length === 0) {
      li.firstChild.remove();
    }

    if (li.firstChild?.nodeName === 'LI') {
      const innerLi = li.firstChild;
      const newLi = document.createElement('li');
      const diffElement = document.createElement(isDiffDeleted ? 'da-diff-deleted' : 'da-diff-added');

      while (innerLi.firstChild) {
        diffElement.appendChild(innerLi.firstChild);
      }

      newLi.appendChild(diffElement);
      li.parentElement.replaceChild(newLi, li);
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

/* eslint-disable max-len */
/**
 * [admin] Unable to preview '.../page.md': source contains large image: error fetching resource at http.../hello: Image 1 exceeds allowed limit of 10.00MB
 * [admin] Unable to preview '.../doc.pdf': PDF is larger than 10MB: 24.0MB
 * [admin] Unable to preview '.../video.mp4': MP4 is longer than 2 minutes: 2m 44s
 * [admin] Unable to preview '.../video.mp4': MP4 has a higher bitrate than 300 KB/s: 494 kilobytes
 * [admin] not authenticated
 * [admin] not authorized
 */
/* eslint-enable max-len */
function parseAemError(xError) {
  if (xError.includes('PDF')) {
    const [seg1, seg2] = xError.split(': ').slice(-2);
    return `${seg1}: ${seg2}`;
  }
  if (xError.includes('MP4')) {
    const [seg1] = xError.split(': ').slice(-2);
    return seg1;
  }
  if (xError.includes('Image')) {
    return xError.split(': ').pop().replace('.00', '');
  }
  return xError.replace('[admin] ', '');
}

export async function getCdnConfig(path) {
  const [org, site] = sanitizePathParts(path);
  const resp = await daFetch(`${AEM_ORIGIN}/config/${org}/sites/${site}.json`);
  if (!resp.ok) {
    // eslint-disable-next-line no-console
    console.warn(`Cannot fetch site config. - Status: ${resp.status}`);
    return { error: 'Cannot fetch site config.', status: resp.status };
  }
  const json = await resp.json();
  if (!json.cdn) return {};
  return {
    preview: json.cdn.preview?.host,
    prod: json.cdn.prod?.host,
  };
}

export async function saveToAem(path, action) {
  const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
  const aemPath = parts.join('/');

  const url = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const resp = await daFetch(url, { method: 'POST' });
  // eslint-disable-next-line no-console
  if (!resp.ok) {
    const { status, headers } = resp;
    const authErr = [401, 403].some((s) => s === status);
    const message = authErr ? `Not authorized to ${action}` : `Error during ${action}`;
    const xerror = headers.get('x-error');

    const error = { action, status, type: 'error', message };
    if (xerror && !authErr) error.details = parseAemError(xerror);

    return { error };
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

function formatSheetData(jData) {
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
const getColumnWidths = (sheet) => sheet?.getConfig()?.columns
  ?.map((col) => parseInt(col?.width, 10) || 50);

function getHeaderWidths(jData, sheet) {
  const widths = getColumnWidths(sheet);
  const headers = jData[0];

  return headers.reduce((result, header, index) => {
    if (header.length > 0) {
      result.push(widths[index]);
    }
    return result;
  }, []);
}

const getSheetProps = (sheet) => {
  const jData = sheet.getData();
  const data = formatSheetData(jData);
  return {
    total: data.length,
    limit: data.length,
    offset: 0,
    data,
    ':colWidths': getHeaderWidths(jData, sheet),
  };
};

export function convertSheets(sheets) {
  const { publicSheets, privateSheets } = sheets.reduce((acc, sheet) => {
    if (sheet.name.startsWith('private-')) {
      acc.privateSheets[sheet.name] = getSheetProps(sheet);
    } else {
      acc.publicSheets[sheet.name] = getSheetProps(sheet);
    }
    return acc;
  }, { publicSheets: {}, privateSheets: {} });

  const publicNames = Object.keys(publicSheets);
  const privateNames = Object.keys(privateSheets);

  let json = {};
  if (publicNames.length > 1) {
    json = publicSheets;
    json[':names'] = publicNames;
    json[':version'] = 3;
    json[':type'] = 'multi-sheet';
  } else if (publicNames.length === 1) {
    const sheetName = publicNames[0];
    json = publicSheets[sheetName];
    json[':sheetname'] = sheetName;
    json[':type'] = 'sheet';
  }

  if (privateNames.length > 0) {
    json[':private'] = privateSheets;
  }
  return json;
}

async function saveJson(fullPath, sheets, jsonToSave, dataType = 'blob') {
  const json = jsonToSave || convertSheets(sheets);

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
  return saveJson(fullPath, sheet, null, 'config');
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
    // eslint-disable-next-line no-console
    console.log('Error creating auto version on publish.');
  }
}

async function getRoleRequestDetails(action) {
  const action2role = {
    preview: 'basic_author',
    publish: 'basic_publish',
  };
  const {
    email: Email,
    authId: Id,
    first_name: firstName,
    last_name: lastName,
  } = await window.adobeIMS.getProfile();

  // Return in the exact order of the admin console csv export
  return {
    Email,
    'First Name': firstName,
    'Last Name': lastName,
    'Country Code': '',
    Id,
    'Role Request': action2role[action],
  };
}

export async function requestRole(org, site, action) {
  let json = JSON.parse(AEM_PERMISSION_TPL);
  const fullpath = `${DA_ORIGIN}/source/${org}/${site}/.da/aem-permission-requests.json`;
  const resp = await daFetch(fullpath);
  if (resp.ok) {
    json = await resp.json();
  }
  const details = await getRoleRequestDetails(action);
  const existingIdx = json.users.data.findIndex((user) => user.Id === details.Id);
  if (existingIdx === -1) {
    json.users.data.unshift(details);
  } else {
    json.users.data[existingIdx] = details;
  }

  const postResp = await saveJson(fullpath, null, json);
  if (!postResp.ok) {
    return {
      message: [
        'Could not request permissions.',
        'Please notify your administrator.',
      ],
    };
  }

  return {
    message: [
      'Successfully requested role!',
      'An administrator will need to approve.',
    ],
  };
}

export function parse(inital) {
  return new DOMParser().parseFromString(inital, 'text/html');
}

export function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function createElement(tag, className = '', attributes = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

export function createTooltip(text, className) {
  const tooltip = createElement('span', className);
  tooltip.textContent = text;
  return tooltip;
}

export function createButton(className, type = 'button', attributes = {}) {
  const button = createElement('button', className, { type, ...attributes });
  return button;
}

export const getMetadata = (el) => {
  if (!el) return {};
  const metadata = {};
  [...el.childNodes].forEach((row) => {
    if (row.children) {
      const key = row.children[0].textContent.trim().toLowerCase();
      const content = row.children[1].textContent.trim().toLowerCase();
      metadata[key] = content;
    }
  });
  return metadata;
};

let daMdMap = null;
export function initDaMetadata(map) {
  daMdMap = map;
}

export function getDaMetadata(key) {
  if (!daMdMap) return key ? null : {};
  if (key) {
    return daMdMap.get(key) || null;
  }
  return Object.fromEntries(daMdMap);
}

export function setDaMetadata(key, value) {
  if (!daMdMap) return;
  if (value === null || value === undefined) {
    daMdMap.delete(key);
  } else {
    daMdMap.set(key, value);
  }
}

export function getDiffLabels() {
  return {
    local: getDaMetadata('diff-label-local') || 'Local',
    upstream: getDaMetadata('diff-label-upstream') || 'Upstream',
  };
}
