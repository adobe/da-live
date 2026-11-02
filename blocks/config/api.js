import { getNx2Api } from '../../scripts/utils.js';
import { emptySheet, getRows, setRows, SHEETS } from './sheets.js';

// nx2 call → { ok, data, status, error }, also when the call itself throws.
async function getJson(call) {
  const api = await getNx2Api();
  try {
    return await api.asJson(call(api));
  } catch (e) {
    return { ok: false, data: null, status: 0, error: e.message };
  }
}

export const readConfig = (org, site = null) => getJson(
  ({ config }) => config.get({ org, site, cachebust: true }),
);

export const readSource = (org, site, path) => getJson(
  ({ source }) => source.get({ org, site, path, cachebust: true }),
);

export const isDenied = ({ status }) => status === 401 || status === 403;

// A 404 means nothing has been written yet: an empty config, not an error.
const isMissing = (result) => result.status === 404;

const isFailed = (result) => !isMissing(result) && (!result.ok || result.error || !result.data);

// Resolves to { status: 'ok' | 'no-access' | 'error', org, site, httpStatus }.
// `org`/`site` are the parsed config JSON, or null when none exists yet.
export async function loadConfigs(org, site = null) {
  const [orgResult, siteResult] = await Promise.all([
    readConfig(org),
    site ? readConfig(org, site) : null,
  ]);
  const results = [orgResult, siteResult].filter(Boolean);

  if (results.some(isDenied)) return { status: 'no-access', org: null, site: null };

  const failed = results.find(isFailed);
  if (failed) return { status: 'error', org: null, site: null, httpStatus: failed.status };

  const dataOf = (result) => (result && !isMissing(result) ? result.data : null);
  return { status: 'ok', org: dataOf(orgResult), site: dataOf(siteResult) };
}

// Same listing da-permissions uses; the picker also merges in sites from the permissions rules.
export async function listSites(org) {
  const { source } = await getNx2Api();
  const list = await source.list({ org }).catch(() => ({}));
  return list.ok ? list.items.filter((item) => !item.ext).map((item) => item.name) : [];
}

// Re-reads right before writing so the conflict window is one round trip (DA ignores If-Match,
// same as mutatePermissions). `mutate(json|null)` returns { config, changed }.
// Resolves to { ok, status, config }, plus `error` when the request itself failed (status 0).
async function mutateJson(read, write, mutate) {
  const current = await read();
  if (isFailed(current)) return { ok: false, status: current.status };

  const { config: next, changed } = mutate(isMissing(current) ? null : current.data);
  if (!changed) return { ok: true, status: 200, config: next };

  try {
    const resp = await write(JSON.stringify(next));
    return { ok: resp.ok, status: resp.status, config: resp.ok ? next : null };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

export async function saveConfig(org, site, mutate) {
  const { config } = await getNx2Api();
  return mutateJson(
    () => readConfig(org, site),
    (body) => config.save({ org, site, body }),
    mutate,
  );
}

export async function saveSource(org, site, path, mutate) {
  const { source } = await getNx2Api();
  return mutateJson(
    () => readSource(org, site, path),
    (body) => source.save({ org, site, path, body }),
    mutate,
  );
}

// The first of `paths` that has a file: { path }, { path: null } when none does, or { failed }.
async function findExisting(org, site, paths) {
  for (const path of paths) {
    // Sequential on purpose: stop at the first file that exists.
    // eslint-disable-next-line no-await-in-loop
    const found = await readSource(org, site, path);
    if (isFailed(found)) return { failed: found };
    if (!isMissing(found)) return { path };
  }
  return { path: null };
}

// Registers a built-in library type in the site config: the first of `paths` that already exists
// (kept as is, like an EDS placeholders sheet), else a new empty sheet at the first path.
// Resolves to the write result plus the registered `path`.
export async function setupLibrary(org, site, { title, paths }) {
  const existing = await findExisting(org, site, paths);
  if (existing.failed) return { ok: false, status: existing.failed.status };
  const path = existing.path ?? paths[0];
  if (!existing.path) {
    const create = () => ({ config: emptySheet(SHEETS.data), changed: true });
    const created = await saveSource(org, site, path, create);
    if (!created.ok) return created;
  }
  const result = await saveConfig(org, site, (json) => setRows(
    json,
    [...getRows(json, SHEETS.library), { title, path }],
    SHEETS.library,
  ));
  return { ...result, path };
}
