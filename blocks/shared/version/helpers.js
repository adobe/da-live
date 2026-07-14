import { formatDate } from '../utils.js';

// hlx6 (.versions) records carry a `version` ULID and ISO `version-date`;
// hlx5 (/versionlist) records carry an epoch `timestamp` and a `users` array.
function isHlx6Entry(entry) {
  return entry.version !== undefined || entry['version-date'] !== undefined;
}

// Map an hlx6 .versions record onto the canonical entry shape the renderers and
// restore flow use. hlx6 has no audit/auto-save entries — every record is a
// restorable version, identified by its ULID rather than a /versionsource url.
function normalizeHlx6Entry(entry) {
  const author = entry['version-by'] || entry['doc-last-modified-by'];
  return {
    timestamp: Date.parse(entry['version-date'] || entry['doc-last-modified']),
    users: author ? [{ email: author }] : [],
    label: entry['version-comment'],
    versionId: entry.version,
  };
}

export function formatVersions(json) {
  const entries = json.map((entry) => (
    isHlx6Entry(entry) ? normalizeHlx6Entry(entry) : entry));

  // Sort by timestamp epoch
  entries.sort((a, b) => b.timestamp - a.timestamp);

  // Make human readable entries. An entry is a restorable version when it has a
  // legacy `url` (hlx5) or a `versionId` (hlx6); otherwise it's an audit entry.
  const ungrouped = entries.map((entry) => {
    const { date, time } = formatDate(entry.timestamp);
    return {
      date,
      time,
      ...entry,
      isVersion: !!(entry.url || entry.versionId),
    };
  });

  // The list endpoint can return the same version record twice (identical
  // url/versionId) — collapse those before grouping so the UI doesn't show
  // duplicate rows for what is really one version.
  const seenVersionIds = new Set();
  const deduped = ungrouped.filter((entry) => {
    if (!entry.isVersion) return true;
    const id = entry.url || entry.versionId;
    if (seenVersionIds.has(id)) return false;
    seenVersionIds.add(id);
    return true;
  });

  // Group consecutive audit entries by date, but never across a version boundary
  return deduped.reduce((acc, entry) => {
    if (entry.isVersion) {
      acc.push(entry);
    } else {
      const last = acc[acc.length - 1];
      if (last && !last.isVersion && last.date === entry.date) {
        last.audits.push(entry);
      } else {
        acc.push({ date: entry.date, audits: [entry] });
      }
    }
    return acc;
  }, []);
}

export function buildDisplayItems(versions) {
  const items = [];
  let auditGroup = null;
  for (const entry of versions) {
    if (entry.isVersion) {
      if (auditGroup) {
        items.push(auditGroup);
        auditGroup = null;
      }
      items.push(entry);
    } else {
      if (!auditGroup) auditGroup = { audits: [] };
      auditGroup.audits.push(...entry.audits);
    }
  }
  if (auditGroup) items.push(auditGroup);
  return items;
}
