import { DA_ORIGIN } from './constants.js';
import { daFetch } from './utils.js';

const ORG_ID_RE = /^[a-z0-9]+$/i;

export function referencedOrgIds(rules = []) {
  const ids = new Map();
  rules
    .flatMap((rule) => (rule.groups ?? '').split(','))
    .map((entry) => entry.trim().split('/')[0])
    .filter((id) => ORG_ID_RE.test(id))
    .forEach((id) => {
      if (!ids.has(id.toLowerCase())) ids.set(id.toLowerCase(), id);
    });
  return [...ids.values()];
}

function request(path, opts = {}) {
  return daFetch(`${DA_ORIGIN}/imsorg${path}`, { ...opts, noRedirect: true }).catch(() => null);
}

export async function listDirectoryOrgs() {
  const resp = await request('');
  if (!resp?.ok) return null;
  const json = await resp.json().catch(() => ({}));
  return json.orgs ?? [];
}

export async function connectDirectory(orgIdent, credential) {
  const resp = await request(`/${encodeURIComponent(orgIdent)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credential),
  });
  const json = await resp?.json?.().catch(() => ({})) ?? {};
  if (resp?.ok && json.connected) return { connected: true };
  if (json.error) return { error: json.error };
  return { error: resp?.status === 403 ? 'not_member' : 'failed' };
}

export async function disconnectDirectory(orgIdent) {
  const resp = await request(`/${encodeURIComponent(orgIdent)}`, { method: 'DELETE' });
  return Boolean(resp?.ok);
}
