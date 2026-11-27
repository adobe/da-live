import { convertHtmlToJson } from '../../../deps/da-sc-sdk/dist/index.js';
import { fetchSourceHtml } from './da-api.js';
import { loadSchemas } from './schemas.js';
import { getNx2Api } from '../../../scripts/utils.js';

export { convertHtmlToJson };

export function isEmptyDocumentHtml(htmlString) {
  if (typeof htmlString !== 'string') return false;

  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const mainContainer = doc.querySelector('body > main > div');
  if (!mainContainer) return false;

  if (mainContainer.childElementCount !== 0) return false;
  if (mainContainer.textContent.trim().length > 0) return false;

  return true;
}

export function isStructuredContentHtml(htmlString) {
  if (!htmlString) return false;

  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const formBlock = doc.querySelector('body > main > div > div.da-form');
  if (!formBlock) return false;

  const rows = Array.from(formBlock.children)
    .filter((row) => row.children.length >= 2);
  if (rows.length === 0) return false;

  const keys = rows
    .map((row) => row.children[0]?.textContent?.trim().toLowerCase())
    .filter(Boolean);

  const hasTitle = keys.includes('title');
  const hasSchemaName = keys.includes('x-schema-name');
  return hasTitle && hasSchemaName;
}

function isDocument(details) {
  const fullpath = (details?.fullpath ?? '').trim();
  if (fullpath.toLowerCase().endsWith('.html')) return true;

  const sourceUrl = details?.sourceUrl;
  if (!sourceUrl || typeof sourceUrl !== 'string') return false;

  try {
    return new URL(sourceUrl).pathname.toLowerCase().endsWith('.html');
  } catch {
    return false;
  }
}

function displayPath(details) {
  const fullpath = (details?.fullpath ?? '').trim();
  return fullpath.replace(/\.(html|json)$/i, '');
}

async function loadHtml(details, fetchHtml) {
  if (!details?.sourceUrl) return { error: 'Missing source URL.' };
  return fetchHtml({ sourceUrl: details.sourceUrl });
}

function loadErrorToBlocker(result) {
  const status = result?.status;
  if (status === 401 || status === 403) return { type: 'no-access' };
  if (status === 404) return { type: 'not-document' };
  if (typeof status === 'number') return { type: 'load-failed', status };
  return { type: 'load-failed' };
}

function withBase(details, schemas) {
  return {
    details,
    schemas,
    displayPath: displayPath(details),
  };
}

// `fetchHtml` and `fetchSchemas` are injectable for testability; defaults are
// the production network calls. Tests pass stubs without touching importmaps
// or stubbing globals.
export async function checkHlx6({ org, site }) {
  if (!org || !site) return false;
  try {
    const { isHlx6 } = await getNx2Api();
    return !!(await isHlx6(org, site));
  } catch {
    return false;
  }
}

// Valid native structured content: object with `metadata.schemaName`.
export function isStructuredContentJson(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  const { metadata } = json;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return typeof metadata.schemaName === 'string' && metadata.schemaName.length > 0;
}

function jsonDetails(details) {
  const fullpath = (details?.fullpath ?? '').trim().replace(/\.(html|json)$/i, '');
  const next = `${fullpath}.json`;
  return { ...details, fullpath: next, sourceUrl: next };
}

function htmlSiblingDetails(details) {
  const next = details.fullpath.replace(/\.json$/i, '.html');
  return { ...details, fullpath: next, sourceUrl: next };
}

function resolveJson({ json, schemas, details }) {
  const base = { storage: 'json', ...withBase(details, schemas) };
  const schemaName = json?.metadata?.schemaName;
  const schema = schemaName ? schemas?.[schemaName] : null;
  if (!schema) {
    return {
      status: 'blocked',
      blocker: { type: 'missing-schema', schemaName: schemaName ?? '' },
      json,
      ...base,
    };
  }
  return { status: 'ready', schemaName, schema, json, ...base };
}

async function loadHlx6Context({ details: htmlDetails, fetchHtml, schemasPromise }) {
  const details = jsonDetails(htmlDetails);
  const [schemas, docResult] = await Promise.all([schemasPromise, loadHtml(details, fetchHtml)]);
  const base = { storage: 'json', ...withBase(details, schemas) };
  const newDoc = () => ({
    status: Object.keys(schemas).length > 0 ? 'select-schema' : 'no-schemas',
    ...base,
  });
  const blocked = (blocker) => ({ status: 'blocked', blocker, ...base });

  if (docResult.error) {
    if (docResult.status !== 404) return blocked(loadErrorToBlocker(docResult));

    // Migration: no .json yet, fall back to a legacy .html document.
    const legacy = await loadHtml(htmlSiblingDetails(details), fetchHtml);
    if (legacy.error) {
      if (legacy.status === 401 || legacy.status === 403) return blocked({ type: 'no-access' });
      if (legacy.status === 404) return newDoc();
      return blocked(loadErrorToBlocker(legacy));
    }
    const html = legacy.html ?? '';
    if (isEmptyDocumentHtml(html)) return newDoc();
    if (!isStructuredContentHtml(html)) return blocked({ type: 'not-form-content' });
    const { json, error } = convertHtmlToJson({ html });
    if (error || !json) return blocked({ type: 'load-failed' });
    return resolveJson({ json, schemas, details });
  }

  const text = (docResult.html ?? '').trim();
  if (!text) return newDoc();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return blocked({ type: 'load-failed' });
  }
  if (json && typeof json === 'object' && !Array.isArray(json)
    && Object.keys(json).length === 0) return newDoc();
  if (!isStructuredContentJson(json)) return blocked({ type: 'not-form-content' });
  return resolveJson({ json, schemas, details });
}

export async function loadFormContext({
  details,
  fetchHtml = fetchSourceHtml,
  fetchSchemas = loadSchemas,
  isHlx6 = checkHlx6,
} = {}) {
  const schemasPromise = fetchSchemas({
    owner: details?.owner,
    repo: details?.repo,
  });

  if (await isHlx6({ org: details?.owner, site: details?.repo })) {
    return loadHlx6Context({ details, fetchHtml, schemasPromise });
  }

  if (!isDocument(details)) {
    const schemas = await schemasPromise;
    return {
      status: 'blocked',
      blocker: { type: 'not-document' },
      ...withBase(details, schemas),
    };
  }

  const [schemas, docResult] = await Promise.all([schemasPromise, loadHtml(details, fetchHtml)]);

  if (docResult.error) {
    return {
      status: 'blocked',
      blocker: loadErrorToBlocker(docResult),
      ...withBase(details, schemas),
    };
  }

  const html = docResult?.html ?? '';
  if (isEmptyDocumentHtml(html)) {
    const hasSchemas = Object.keys(schemas).length > 0;
    return {
      status: hasSchemas ? 'select-schema' : 'no-schemas',
      ...withBase(details, schemas),
    };
  }

  if (!isStructuredContentHtml(html)) {
    return {
      status: 'blocked',
      blocker: { type: 'not-form-content' },
      ...withBase(details, schemas),
    };
  }

  const { json, error: parseError } = convertHtmlToJson({ html });
  if (parseError || !json) {
    return {
      status: 'blocked',
      blocker: { type: 'load-failed' },
      ...withBase(details, schemas),
    };
  }

  const schemaName = json?.metadata?.schemaName;
  const schema = schemaName ? schemas?.[schemaName] : null;
  if (!schema) {
    return {
      status: 'blocked',
      blocker: { type: 'missing-schema', schemaName: schemaName ?? '' },
      json,
      ...withBase(details, schemas),
    };
  }

  return {
    status: 'ready',
    schemaName,
    schema,
    json,
    ...withBase(details, schemas),
  };
}
