import { DOMParser as proseDOMParser, DOMSerializer, Y } from 'da-y-wrapper';
import { aem2doc, getSchema, yDocToProsemirror } from 'da-parser';
import { AEM_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import { sanitizePathParts } from '../../../../scripts/utils.js';
import prose2aem from '../../shared/prose2aem.js';
import { daFetch } from '../../shared/utils.js';

const AEM_PERMISSION_TPL = '{"users":{"total":1,"limit":1,"offset":0,"data":[]},"data":{"total":1,"limit":1,"offset":0,"data":[{}]},":names":["users","data"],":version":3,":type":"multi-sheet"}';

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

export async function htmlToProse(html) {
  const ydoc = new Y.Doc();
  await aem2doc(html, ydoc);

  const schema = getSchema();
  const pmDoc = yDocToProsemirror(schema, ydoc);
  const serializer = DOMSerializer.fromSchema(schema);
  const fragment = serializer.serializeFragment(pmDoc.content);

  const dom = document.createElement('div');
  dom.append(fragment);

  return { dom, ydoc };
}
