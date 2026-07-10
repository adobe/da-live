import { formatDate } from '../utils.js';
import { getNx2Api } from '../../../scripts/utils.js';
import { formatVersions } from './helpers.js';

// Fetch and format the version list for a document path.
// Returns the formatted array on success, null on network/auth failure.
export async function fetchVersions(path) {
  const { versions } = await getNx2Api();
  const resp = await versions.list(path);
  if (!resp.ok) return null;
  try {
    return formatVersions(await resp.json());
  } catch {
    return [];
  }
}

// Build an optimistic "new version" entry shown while the create form is open.
export function newVersionEntry() {
  const { date, time } = formatDate();
  return { date, time, isVersion: true, users: [] };
}

// POST a new version to the server. Returns true on success (201).
export async function createVersion(path, label) {
  const { versions } = await getNx2Api();
  const res = await versions.create(path, label ? { comment: label } : {});
  return res.status === 201;
}

// Compute the versionId for a preview/restore dispatch from a list entry.
export function getVersionId(path, entry) {
  const [, org, site] = path.split('/');
  return entry.url
    ? entry.url.replace(`/versionsource/${org}/${site}/`, '')
    : entry.versionId;
}

// Fetch a version's HTML body element for comparison.
export async function fetchVersionHtml(path, entry) {
  const { versions } = await getNx2Api();
  const versionId = getVersionId(path, entry);
  const resp = await versions.get(path, { versionId });
  if (!resp.ok) return null;
  try {
    const text = await resp.text();
    return new DOMParser().parseFromString(text, 'text/html').body;
  } catch {
    return null;
  }
}
