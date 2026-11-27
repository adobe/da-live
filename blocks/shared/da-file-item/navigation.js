import getEditPath from './edit-path.js';
import { getNx2Api } from '../../../scripts/utils.js';

export function getFileItemHref({ path, ext, editor }) {
  if (ext !== 'link') return ext ? getEditPath({ path, ext, editor }) : `#${path}`;
  return getNx2Api().then(async ({ source }) => {
    const response = await source.get(path);
    if (!response.ok) throw new Error(`Link request failed (${response.status})`);
    const { externalUrl } = await response.json();
    if (!externalUrl) throw new Error('Link has no destination');
    return externalUrl;
  });
}

// Sheets carry `:type`; native structured content carries `metadata.schemaName`.
export function isStructuredContentJson(json) {
  return !!json && typeof json === 'object' && !Array.isArray(json) && !json[':type']
    && typeof json.metadata?.schemaName === 'string' && json.metadata.schemaName.length > 0;
}

// The list API can't tell a sheet from native structured content (both `.json`),
// so peek at the content to pick the editor. Falls back to the sheet editor.
export async function getJsonEditorHref({ path, ext, editor }) {
  const fallback = getEditPath({ path, ext, editor });
  try {
    const { source } = await getNx2Api();
    const resp = await source.get(path);
    if (resp.ok && isStructuredContentJson(await resp.json())) {
      return `/form${window.location.search}#${path}`;
    }
  } catch {
    // fall through to the sheet editor
  }
  return fallback;
}

// Async href for on-demand navigation (click, search pick).
export function resolveFileItemHref(item) {
  if (item.ext === 'json') return getJsonEditorHref(item);
  return getFileItemHref(item);
}
