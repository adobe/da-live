import { getNx2Api } from '../../scripts/utils.js';
import { hasPermissionsSheet } from './utils.js';

/** @typedef {import('./utils.js').Rule} Rule */

/**
 * Load the org's config and, if present, its `permissions` sheet rules.
 * @param {string} org
 * @returns {Promise<{
 *   status: 'ok'|'no-access'|'no-sheet'|'error',
 *   config: object|null,
 *   rules: Rule[],
 * }>}
 */
export async function loadOrgConfig(org) {
  const { config, asJson } = await getNx2Api();
  let resp;
  try {
    resp = await config.get({ org, cachebust: true });
  } catch {
    return { status: 'error', config: null, rules: [] };
  }

  if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
    return { status: 'no-access', config: null, rules: [] };
  }
  if (!resp.ok) {
    return { status: 'error', config: null, rules: [] };
  }

  const { data, error } = await asJson(resp);
  if (error || !data) {
    return { status: 'error', config: null, rules: [] };
  }

  if (!hasPermissionsSheet(data)) {
    return { status: 'no-sheet', config: data, rules: [] };
  }
  return { status: 'ok', config: data, rules: data.permissions.data };
}

// Concurrent writers: last write wins (accepted, documented). da-admin stores
// org config in Cloudflare KV and the `/config` route ignores `If-Match` (KV
// has no conditional writes), so there's no way to detect a conflicting save
// between our GET and our PUT. Fetch-latest-then-save keeps the window to one
// round trip, matching the plugin and the `/config` sheet editor. See
// docs/superpowers/specs/2026-10-22-permissions-block-design.md for the
// follow-up (ETag / If-Match on da-admin) this is deferring.
/**
 * Read the org config, apply a pure mutation, and save if it changed.
 * @param {string} org
 * @param {(config: object) => { config: object, changed: boolean }} mutate
 * @returns {Promise<{ ok: boolean, status: number, rules?: Rule[], error?: string }>}
 */
export async function mutatePermissions(org, mutate) {
  const { config, asJson } = await getNx2Api();
  let resp;
  try {
    resp = await config.get({ org, cachebust: true });
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
  if (!resp.ok) {
    return { ok: false, status: resp.status };
  }

  const { data, error } = await asJson(resp);
  if (error || !data) {
    return { ok: false, status: resp.status, error: 'parse-failed' };
  }

  if (!hasPermissionsSheet(data)) {
    return { ok: false, status: 409, error: 'no-sheet' };
  }

  const { config: next, changed } = mutate(data);
  if (!changed) {
    return { ok: true, status: 200, rules: next.permissions.data };
  }

  let saveResp;
  try {
    saveResp = await config.save({ org, body: JSON.stringify(next) });
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
  if (!saveResp.ok) {
    return { ok: false, status: saveResp.status };
  }
  return { ok: true, status: saveResp.status, rules: next.permissions.data };
}

/**
 * List the org's sites (folders only).
 * @param {string} org
 * @returns {Promise<string[]>}
 */
export async function listSites(org) {
  const { source } = await getNx2Api();
  let ok;
  let items;
  try {
    ({ ok, items } = await source.list({ org }));
  } catch {
    return [];
  }
  if (!ok) return [];
  return items.filter((item) => !item.ext).map((item) => item.name);
}

/**
 * List the folders under a path within a site (folders only).
 * @param {string} org
 * @param {string} site
 * @param {string} [path]
 * @returns {Promise<{ name: string, path: string }[]>}
 */
export async function listFolders(org, site, path = '/') {
  const { source } = await getNx2Api();
  let ok;
  let items;
  try {
    ({ ok, items } = await source.list({ org, site, path }));
  } catch {
    return [];
  }
  if (!ok) return [];
  return items
    .filter((item) => !item.ext)
    .map((item) => ({ name: item.name, path: item.path }));
}
