import { fetchSourceByPath, listPath } from './da-api.js';

const FORMS_BASE_PATH = '/.da/forms';
const cache = new Map();

function cacheKey(owner, repo) {
  if (!owner || !repo) return '';
  return `${owner}/${repo}`;
}

async function loadSchema(entry, fetch) {
  const result = await fetch({ path: entry?.path });
  if (result.error || !result.html) return null;

  try {
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const jsonStr = doc.querySelector('code')?.textContent;
    if (!jsonStr) return null;
    return { id: entry.name, ...JSON.parse(jsonStr) };
  } catch {
    return null;
  }
}

// `list` and `fetch` are injectable for testability; defaults are the
// production network calls. Tests pass stubs and use unique (owner, repo)
// pairs to bypass the module-level cache.
export async function loadSchemas({
  owner,
  repo,
  list = listPath,
  fetch = fetchSourceByPath,
} = {}) {
  const key = cacheKey(owner, repo);
  if (!key) return {};

  if (cache.has(key)) return cache.get(key);

  const path = `/${owner}/${repo}${FORMS_BASE_PATH}/schemas`;
  const listed = await list({ path });
  if (listed.error) {
    cache.set(key, {});
    return {};
  }

  const loaded = await Promise.all(listed.json.map((entry) => loadSchema(entry, fetch)));

  const schemas = loaded.reduce((acc, schema) => {
    if (!schema?.id) return acc;
    acc[schema.id] = schema;
    return acc;
  }, {});

  cache.set(key, schemas);
  return schemas;
}
