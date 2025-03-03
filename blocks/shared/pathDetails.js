import { CON_ORIGIN, DA_ORIGIN } from './constants.js';

let currpath;
let currhash;
let details;

function getSheetExt(editor, path) {
  if (editor === 'sheet' && !path.endsWith('.json')) return `${path}.json`;
  return path;
}

function getOrgDetails({ editor, pathParts, ext }) {
  const fullPath = pathParts.join('/');

  const parent = ext === null ? `/${fullPath}` : '/';
  const parentName = ext === null ? pathParts[0] : 'Root';
  const name = editor === 'config' && ext === null ? 'config' : pathParts[0];
  const daApi = editor === 'config' ? 'config' : 'source';
  let path = ext === 'html' && !fullPath.endsWith('html') ? `${fullPath}.html` : fullPath;
  if (editor === 'sheet' && !path.endsWith('.json')) path = `${path}.${ext}`;

  return {
    owner: pathParts[0],
    name,
    parent,
    parentName,
    sourceUrl: `${DA_ORIGIN}/${daApi}/${path}`,
  };
}

function getRepoDetails({ editor, pathParts, ext }) {
  const [org, repo] = pathParts;
  const fullPath = pathParts.join('/');

  const parent = ext === null ? `/${org}/${repo}` : `/${org}`;
  const parentName = ext === null ? repo : org;
  const name = editor === 'config' ? `${repo} config` : repo;
  const daApi = editor === 'config' ? 'config' : 'source';
  let path = ext === 'html' && !fullPath.endsWith('html') ? `${fullPath}.html` : fullPath;
  if (editor === 'sheet' && !path.endsWith('.json')) path = `${path}.${ext}`;

  return {
    owner: org,
    repo,
    name,
    parent,
    parentName,
    sourceUrl: `${DA_ORIGIN}/${daApi}/${path}`,
    previewUrl: `https://main--${repo}--${org}.aem.live`,
    contentUrl: `${CON_ORIGIN}/${fullPath}`,
  };
}

function getFullDetails({ editor, pathParts, ext }) {
  const [org, repo, ...parts] = pathParts;
  // Fullpath contains repo and org
  let fullPath = pathParts.join('/');
  fullPath = getSheetExt(editor, fullPath);

  // Pathname is path without repo and org
  let pathname = `/${parts.join('/')}`;
  pathname = getSheetExt(editor, pathname);

  const name = pathParts.pop();
  const parent = `/${pathParts.join('/')}`;
  const parentName = pathParts.pop();

  const daApi = editor === 'config' ? 'config' : 'source';
  const path = ext === 'html' && !fullPath.endsWith('html') && editor !== 'sheet' ? `${fullPath}.html` : fullPath;

  return {
    owner: org,
    repo,
    name: ext === null ? 'config' : name,
    parent: ext === null ? `${parent}/${name}` : parent,
    parentName: ext === null ? name : parentName,
    sourceUrl: `${DA_ORIGIN}/${daApi}/${path}`,
    previewUrl: `https://main--${repo}--${org}.aem.live${pathname}`,
    contentUrl: `${CON_ORIGIN}/${fullPath}`,
  };
}

function getExtension(editor, name, isFolder) {
  const nameSplit = name.split('.');
  if (nameSplit.length >= 2) return nameSplit.pop();
  if (isFolder || editor === 'browse') return null;
  if (editor === 'sheet' && nameSplit.slice(-1)[0] !== 'json') return 'json';
  return 'html';
}

function getView(pathname) {
  const view = pathname.replace('/', '');
  return view === '' ? 'browse' : view;
}

export default function getPathDetails(loc) {
  const { pathname, hash: tmpHash } = loc || window.location;
  if (!pathname || !tmpHash) return undefined;

  // There can be non-ideal pieces in the hash (old_hash, access_token)
  const parts = tmpHash.split('#');
  const hashPath = parts.find((part) => part.startsWith('/'));

  // If there's not a hash path, return undefined
  if (!hashPath) return undefined;
  const hash = `#${hashPath}`;

  // Use cached details if the hash has not changed
  if (currhash === hash && currpath === pathname && details) return details;
  currhash = hash;

  const fullpath = hash.replace('#', '');

  // config, edit, sheet
  const editor = getView(pathname);

  // IMS will redirect and there's a small window where old_hash exists
  if (!fullpath || fullpath.startsWith('old_hash') || fullpath.startsWith('access_token')) return null;

  // Split everything up so it can be later used for both DA & AEM
  const pathParts = fullpath.slice(1).toLowerCase().split('/');

  // Determine if folder (trailing slash split to empty string)
  let isFolder = false;
  if (pathParts.slice(-1)[0] === '') {
    isFolder = true;
    pathParts.pop();
  }

  // Determine extension
  const ext = getExtension(editor, pathParts.slice(-1)[0], isFolder);

  const depth = pathParts.length;

  if (depth === 1) details = getOrgDetails({ editor, pathParts, ext });

  if (depth === 2) details = getRepoDetails({ editor, pathParts, ext });

  if (depth >= 3) details = getFullDetails({ editor, pathParts, ext });

  let path = ext === 'html' && !fullpath.endsWith('html') ? `${fullpath}.html` : fullpath;
  if (editor === 'sheet' && !path.endsWith('.json')) path = `${path}.${ext}`;

  details = { ...details, origin: DA_ORIGIN, fullpath: path, depth, view: editor };

  return details;
}
