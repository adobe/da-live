// Test fixture mirroring da-nx nx2/utils/structuredContent.js.
import { getFirstSheet } from './daConfig.js';

const SC_EDITOR = '/form';
const SC_ORIGIN = 'https://da-sc.adobeaem.workers.dev';
const stripHtml = (path) => path.replace(/\.html$/, '');

const isFormEditor = (editor) => editor.split(/[?#]/)[0].endsWith(SC_EDITOR);

function isFormRule(path, { key, value }) {
  if (key !== 'editor.path' || !value?.includes?.('=')) return false;
  const idx = value.indexOf('=');
  const prefix = value.slice(0, idx).trim();
  return !!prefix && path.startsWith(prefix) && isFormEditor(value.slice(idx + 1).trim());
}

// A page is structured content when any matching `editor.path` prefix points at the form
// editor. `configs` are the [org, site] configs from fetchDaConfigs.
// This deliberately simplifies da-live's da-browse `getEditor()` (longest prefix wins) instead
// of sharing it: that resolver is a browse instance method tied to the current folder. It
// assumes no longer matching prefix overrides a form rule with a different editor.
// TODO: replace this config-based check once structured content becomes a first-class type.
export function isStructuredContent({ path, configs }) {
  const name = path?.split('/').pop() ?? '';
  if (!path || (name.includes('.') && !name.endsWith('.html'))) return false;
  return (configs ?? []).filter(Boolean)
    .flatMap((config) => getFirstSheet(config) ?? [])
    .some((row) => isFormRule(path, row));
}

export const getStructuredContentEditHref = (path) => `${SC_EDITOR}#${stripHtml(path)}`;

export const getStructuredContentHref = ({ path, tier = 'preview' }) => `${SC_ORIGIN}/${tier}${stripHtml(path)}`;
