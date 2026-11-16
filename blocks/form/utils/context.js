import { convertHtmlToJson } from '../../../deps/da-sc-sdk/dist/index.js';
import { fetchSourceHtml } from './da-api.js';
import { loadSchemas } from './schemas.js';

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
  return fullpath.toLowerCase().endsWith('.html') ? fullpath.slice(0, -5) : fullpath;
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
export async function loadFormContext({
  details,
  fetchHtml = fetchSourceHtml,
  fetchSchemas = loadSchemas,
} = {}) {
  const schemasPromise = fetchSchemas({
    owner: details?.owner,
    repo: details?.repo,
  });

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
