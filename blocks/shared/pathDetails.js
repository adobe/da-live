import { CON_ORIGIN, DA_ORIGIN } from './constants.js';
import { sanitizePathParts } from '../../scripts/utils.js';
import { parseSiteSegment } from './content-branch-context.js';
import { withDaRsBinding } from './da-rs-navigation.js';
import { isDaRsBinding } from './da-rs-provider.js';
import { encodeDaRsAliasPath, parseDaRsAliasPath } from './da-rs-alias-path.js';

function getSourceUrl(api, path, bound) {
  return `${DA_ORIGIN}/${api}${bound ? encodeDaRsAliasPath(`/${path}`) : `/${path}`}`;
}

function getSheetExt(editor, path) {
  if (editor === 'sheet' && !path.endsWith('.json')) return `${path}.json`;
  return path;
}

function getOrgDetails({ editor, pathParts, ext, bound }) {
  const fullPath = pathParts.join('/');

  const parent = ext === null ? `/${fullPath}` : '/';
  const parentName = ext === null ? pathParts[0] : 'Root';
  const name = editor === 'config' && ext === null ? 'config' : pathParts[0];
  const daApi = editor === 'config' ? 'config' : 'source';
  let path = ext === 'html' && !fullPath.endsWith('.html') ? `${fullPath}.html` : fullPath;
  if (editor === 'sheet' && !path.endsWith('.json')) path = `${path}.${ext}`;
  const org = pathParts[0];

  return {
    org,
    owner: org,
    name,
    parent,
    parentName,
    sourceUrl: getSourceUrl(daApi, path, bound),
  };
}

function getRepoDetails({ editor, pathParts, ext, bound }) {
  const [org, repo] = pathParts;
  const branch = repo.includes('~') ? parseSiteSegment(repo).branch : null;
  const fullPath = pathParts.join('/');

  const parent = ext === null ? `/${org}/${repo}` : `/${org}`;
  const parentName = ext === null ? repo : org;
  const name = editor === 'config' ? `${repo} config` : repo;
  const daApi = editor === 'config' ? 'config' : 'source';
  let path = ext === 'html' && !fullPath.endsWith('.html') ? `${fullPath}.html` : fullPath;
  if (editor === 'sheet' && !path.endsWith('.json')) path = `${path}.${ext}`;

  return {
    org,
    site: repo,
    owner: org,
    repo,
    name,
    parent,
    parentName,
    sourceUrl: getSourceUrl(daApi, path, bound),
    previewUrl: branch || bound ? undefined : `https://main--${repo}--${org}.aem.live`,
    contentUrl: branch || bound ? undefined : `${CON_ORIGIN}/${fullPath}`,
  };
}

function getFullDetails({ editor, pathParts, ext, bound }) {
  const [org, repo, ...parts] = pathParts;
  const branch = repo.includes('~') ? parseSiteSegment(repo).branch : null;
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
  const path = ext === 'html' && !fullPath.endsWith('.html') && editor !== 'sheet' ? `${fullPath}.html` : fullPath;

  return {
    org,
    site: repo,
    owner: org, // Backwards compatibility
    repo, // Backwards compatibility
    path: pathname,
    name: ext === null ? 'config' : name,
    parent: ext === null ? `${parent}/${name}` : parent,
    parentName: ext === null ? name : parentName,
    sourceUrl: getSourceUrl(daApi, path, bound),
    previewUrl: branch || bound ? undefined : `https://main--${repo}--${org}.aem.live${pathname}`,
    contentUrl: branch || bound ? undefined : `${CON_ORIGIN}/${fullPath}`,
  };
}

function getExtension(editor, name, isFolder) {
  const nameSplit = name.split('.');
  if (nameSplit.length >= 2) return nameSplit.pop();
  if (isFolder || editor === 'browse' || editor === 'config') return null;
  if (editor === 'sheet' && nameSplit.slice(-1)[0] !== 'json') return 'json';
  return 'html';
}

function getView(pathname) {
  const view = pathname.replace('/', '');
  return view === '' ? 'browse' : view;
}

export default function getPathDetails(loc) {
  const { pathname, hash } = loc || window.location;
  if (!pathname || !hash) return undefined;

  const bound = isDaRsBinding();
  // Only hosted routes accept the legacy IMS fragment salvage logic. A second '#'
  // in a bound path is invalid, not a reason to silently open its prefix.
  if (bound && !hash.startsWith('#/')) return undefined;
  let fullpath = bound ? hash.slice(1) : hash.split('#').find((part) => part.startsWith('/'));
  if (!fullpath) return undefined;

  // config, edit, sheet
  const editor = getView(pathname);

  // IMS redirect fragments appear as '/ld_hash=', '/old_hash=', '/access_token=' in the path.
  // fullpath always starts with '/' here, so strip it before the prefix check.
  if (!bound) window.name = fullpath;
  const pathContent = fullpath.slice(1);
  if (!pathContent || (!bound && /^(?:old_hash|access_token|ld_hash)/.test(pathContent))) return null;

  // Split everything up so it can be later used for both DA & AEM
  const pathParts = bound ? parseDaRsAliasPath(fullpath) : sanitizePathParts(fullpath);
  if (bound) {
    if (editor === 'media' && (pathParts.length < 3 || !pathParts.at(-1))) {
      throw new TypeError('Invalid da-rs media path');
    }
    window.name = fullpath;
  }

  if (editor === 'edit') {
    // Redirect JSON files from edit view to sheet view
    if ((bound ? pathParts.at(-1) : fullpath).endsWith('.json')) {
      const sheetPath = bound ? encodeDaRsAliasPath(`/${pathParts.join('/')}`).slice(0, -5)
        : fullpath.slice(0, -5);
      window.location.href = withDaRsBinding(`/sheet#${sheetPath}`);
      return null;
    }

    if (fullpath.endsWith('/')) {
      // Remove trailing slash from pathParts and fullpath
      pathParts.pop();
      fullpath = fullpath.slice(0, -1);
      if (!loc) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${fullpath}`);
      }
    }
  }

  // Determine if folder (trailing slash split to empty string)
  let isFolder = false;
  if (pathParts.slice(-1)[0] === '') {
    isFolder = true;
    pathParts.pop();
  }

  // Determine extension
  const name = pathParts.at(-1);
  // Media routes carry the complete Source filename, not a document slug.
  const ext = bound && editor === 'media' ? '' : getExtension(editor, name, isFolder);

  const depth = pathParts.length;
  const cleanParts = [...pathParts];

  const args = { editor, pathParts, ext, bound };
  let details;
  if (depth === 1) details = getOrgDetails(args);
  if (depth === 2) details = getRepoDetails(args);
  if (depth >= 3) details = getFullDetails(args);

  const cleanPath = `/${cleanParts.join('/')}`;
  let path = ext === 'html' && !cleanPath.endsWith('.html') && editor !== 'sheet' ? `${cleanPath}.html` : cleanPath;
  if (editor === 'sheet' && !path.endsWith('.json')) path = `${path}.${bound ? 'json' : ext}`;
  if (isFolder && !path.endsWith('/')) path = `${path}/`;

  return { ...details, origin: DA_ORIGIN, fullpath: path, depth, view: editor };
}
