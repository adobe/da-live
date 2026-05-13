import { daFetch } from '../shared/utils.js';
import { AEM_ORIGIN, DA_ORIGIN, getLivePreviewUrl } from '../shared/constants.js';

export async function saveToAem(path, action) {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const orgSlashIndex = normalizedPath.indexOf('/');
  if (orgSlashIndex < 1) {
    return { error: 'Invalid path for AEM', status: 0 };
  }
  const siteSlashIndex = normalizedPath.indexOf('/', orgSlashIndex + 1);
  if (siteSlashIndex < orgSlashIndex + 1) {
    return { error: 'Invalid path for AEM', status: 0 };
  }
  const owner = normalizedPath.slice(0, orgSlashIndex).toLowerCase();
  const repo = normalizedPath.slice(orgSlashIndex + 1, siteSlashIndex).toLowerCase();
  const aemPath = normalizedPath.slice(siteSlashIndex + 1);
  const requestUrl = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const response = await daFetch(requestUrl, { method: 'POST' });
  if (!response.ok) {
    const headerError = response.headers.get('x-error') || response.statusText || 'AEM request failed';
    return { error: headerError, status: response.status };
  }
  try {
    const json = await response.json();
    return { json };
  } catch {
    return { json: {} };
  }
}

export async function deploy(sourcePath, action) {
  const phases = action === 'publish' ? ['preview', 'live'] : ['preview'];
  const openedUrls = [];
  for (const phase of phases) {
    const result = await saveToAem(sourcePath, phase);
    if ('error' in result) return { ok: false };
    if (phase === 'preview' && action === 'preview') {
      const url = result.json?.preview?.url;
      if (url) openedUrls.push(url);
    } else if (phase === 'live') {
      const url = result.json?.live?.url;
      if (url) openedUrls.push(url);
    }
  }
  return { ok: true, openedUrls };
}

export function getItemPreviewUrl(item) {
  const path = item?.path || '';
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const orgSlashIndex = normalizedPath.indexOf('/');
  if (orgSlashIndex < 1) return null;
  const siteSlashIndex = normalizedPath.indexOf('/', orgSlashIndex + 1);
  if (siteSlashIndex < orgSlashIndex + 1) return null;
  const owner = normalizedPath.slice(0, orgSlashIndex).toLowerCase();
  const repo = normalizedPath.slice(orgSlashIndex + 1, siteSlashIndex).toLowerCase();
  const aemPath = normalizedPath.slice(siteSlashIndex + 1);
  const base = getLivePreviewUrl(owner, repo);
  if (!aemPath) return base;
  const cleanPath = item.ext === 'html' ? aemPath.replace(/\.html$/, '') : aemPath;
  return `${base}/${cleanPath}`;
}

export async function renameItem(item, newName) {
  const { path, name } = item;
  const idx = path.lastIndexOf(name);
  if (idx < 0) return { ok: false, error: 'Could not determine new path' };
  const newPath = `${path.slice(0, idx)}${newName}${path.slice(idx + name.length)}`;
  const body = new FormData();
  body.append('destination', newPath);
  const response = await daFetch(`${DA_ORIGIN}/move${path}`, { method: 'POST', body });
  if (response.status === 204 || response.ok) return { ok: true, newPath };
  const error = response.headers?.get('x-error') || response.statusText || 'Rename failed';
  return { ok: false, error };
}

export async function deleteSourcePath(path) {
  if (!path) return { ok: false, error: 'Missing path' };
  const response = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
  if (!response.ok) {
    const error = response.headers.get('x-error') || response.statusText || 'Delete failed';
    return { ok: false, status: response.status, error };
  }
  return { ok: true };
}
