import { getNx2Api } from '../../scripts/utils.js';
import { hasPermissionsSheet } from './utils.js';

/** @typedef {import('./utils.js').Rule} Rule */

/**
 * Fetch the org config, bypassing caches. Never throws: a network failure is
 * reported as `status: 0` with the error message.
 * @param {string} org
 * @returns {Promise<{ ok: boolean, data: object|null, status: number, error: string|null }>}
 */
async function readOrgConfig(org) {
  const { config, asJson } = await getNx2Api();
  try {
    return await asJson(config.get({ org, cachebust: true }));
  } catch (e) {
    return { ok: false, data: null, status: 0, error: e.message };
  }
}

/**
 * Load the org's config and, if present, its `permissions` sheet rules.
 * @param {string} org
 * @returns {Promise<{
 *   status: 'ok'|'no-access'|'no-sheet'|'error',
 *   config: object|null,
 *   rules: Rule[],
 *   httpStatus?: number,
 * }>}
 */
export async function loadOrgConfig(org) {
  const { ok, data, status, error } = await readOrgConfig(org);
  if (status === 401 || status === 403 || status === 404) {
    return { status: 'no-access', config: null, rules: [] };
  }
  if (!ok || error || !data) {
    return { status: 'error', config: null, rules: [], httpStatus: status };
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
  const { ok, data, status, error } = await readOrgConfig(org);
  if (!ok) {
    return status ? { ok: false, status } : { ok: false, status: 0, error };
  }
  if (error || !data) {
    return { ok: false, status, error: 'parse-failed' };
  }

  if (!hasPermissionsSheet(data)) {
    return { ok: false, status: 409, error: 'no-sheet' };
  }

  const { config: next, changed } = mutate(data);
  if (!changed) {
    return { ok: true, status: 200, rules: next.permissions.data };
  }

  const { config } = await getNx2Api();
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
