import { loadBlockEditor } from '../ew-panel-extensions/helpers.js';

/**
 * "Universal Editor blocks" — blocks whose content is better edited in the Universal Editor
 * (e.g. a form stored as JSON). Marked in the block library's "editor" sheet with
 * `property: 'universal-editor'`; the `value` is either the IMS org of the Universal Editor
 * (e.g. `formsinternal01`) or a URL template with {branch}, {site}, {org} and {path}.
 * For these, the block toolbar offers "Edit in Universal Editor".
 */

const PROPERTY = 'universal-editor';
const DEFAULT_TEMPLATE = 'https://experience.adobe.com/#/@{imsOrg}/aem/editor/canvas/{branch}--{site}--{org}.ue.da.live{path}';

function normalize(name) {
  return (name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

/** Pure lookup: the "editor" sheet value configuring `blockName` for the Universal Editor. */
export function findUniversalEditorSetting(rows, blockName) {
  const target = normalize(blockName);
  const row = (rows || []).find((r) => normalize(r.block) === target
    && r.property?.toLowerCase().trim() === PROPERTY);
  return row?.value?.trim() || null;
}

/** Page path (`/folder/page`) of a DA source URL (`…/source/{org}/{site}/folder/page.html`). */
export function pagePathFromSourceUrl(sourceUrl) {
  try {
    const segments = new URL(sourceUrl).pathname.split('/').filter(Boolean);
    const start = segments.indexOf('source');
    if (start < 0 || segments.length < start + 4) return null;
    const path = `/${segments.slice(start + 3).join('/')}`.replace(/\.html?$/i, '');
    return path.endsWith('/index') ? path.slice(0, -'index'.length) : path;
  } catch {
    return null;
  }
}

export function buildUniversalEditorUrl(setting, { org, site, branch = 'main', path } = {}) {
  if (!setting || !org || !site || !path) return null;
  const template = setting.includes('://') ? setting : DEFAULT_TEMPLATE;
  const values = { imsOrg: setting, org, site, branch, path };
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

export async function getUniversalEditorUrl(org, site, blockName, ctx) {
  if (!org || !site || !blockName) return null;
  const setting = findUniversalEditorSetting(await loadBlockEditor(org, site), blockName);
  return buildUniversalEditorUrl(setting, { org, site, ...ctx });
}
