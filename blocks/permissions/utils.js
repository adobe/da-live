/** @typedef {'read'|'write'|'none'} Level */
/** @typedef {{ path: string, groups: string, actions: string }} Rule */
/** @typedef {{ path: string, kind: 'config'|'content'|'folder'|'other', label: string,
 *   read: string[], write: string[], none: string[],
 *   inheritedRead: string[], inheritedWrite: string[], inheritedNone: string[],
 *   pending?: boolean }} Slot */

// Trailing "+**" variants (with or without spaces around the `+`) normalized to " + **".
const WILDCARD_SUFFIX_RE = /\s*\+\s*\*\*\s*$/;

/**
 * Normalize a rule path so variants like `/s/+**`, `/s/ +**` and `/s/+ **`
 * all become `/s/ + **`. Paths without a wildcard suffix (e.g. `CONFIG`) are
 * returned unchanged. `undefined`/`null` pass through unchanged.
 * @param {string|undefined|null} path
 * @returns {string|undefined|null}
 */
export function normPath(path) {
  if (path === undefined || path === null) return path;
  return path.replace(WILDCARD_SUFFIX_RE, ' + **');
}

/**
 * Split a comma-separated groups string into trimmed, non-empty members.
 * @param {string} groups
 * @returns {string[]}
 */
export function splitGroups(groups) {
  return (groups || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

/**
 * Map a rule's `actions` string to a permission level.
 * @param {string} actions
 * @returns {Level}
 */
export function actionsToLevel(actions) {
  if (actions === 'read') return 'read';
  if (actions === 'write') return 'write';
  return 'none';
}

/**
 * Map a permission level back to a rule's `actions` string.
 * @param {Level} level
 * @returns {string}
 */
export function levelToActions(level) {
  if (level === 'read') return 'read';
  if (level === 'write') return 'write';
  return '';
}

/** Human-readable label for a permission level, shared by the container and table. */
export const LEVEL_LABEL = { read: 'Read', write: 'Write', none: 'None' };

/**
 * The two default scope paths for a view: org scopes when `site` is null/empty,
 * otherwise the site's config and content scopes.
 * @param {string|null} site
 * @returns {string[]}
 */
export function defaultPaths(site) {
  if (!site) return ['CONFIG', '/ + **'];
  return [`/${site}/CONFIG`, normPath(`/${site}/+**`)];
}

/**
 * Build the normalized rule path for a folder scope.
 * @param {string} site
 * @param {string} folder
 * @returns {string}
 */
export function folderRulePath(site, folder) {
  return normPath(`/${site}/${folder}/+**`);
}

/**
 * Classify a rule path's scope kind. String comparisons only — never builds a
 * RegExp from `site`, so sites with regex-special characters (`my.site`) are
 * matched literally.
 * @param {string} path
 * @param {string|null} site
 * @returns {Slot['kind']}
 */
export function scopeKind(path, site) {
  const norm = normPath(path);
  if (!site) {
    if (norm === 'CONFIG') return 'config';
    if (norm === '/ + **') return 'content';
    return 'other';
  }
  const prefix = `/${site}/`;
  if (!norm.startsWith(prefix)) return 'other';
  if (norm === `${prefix}CONFIG`) return 'config';
  if (norm === normPath(`${prefix}+**`)) return 'content';
  const rest = norm.slice(prefix.length);
  if (rest.endsWith('/ + **')) return 'folder';
  return 'other';
}

/**
 * Human-readable label for a rule path's scope.
 * @param {string} path
 * @param {string|null} site
 * @returns {string}
 */
export function scopeLabel(path, site) {
  const kind = scopeKind(path, site);
  const norm = normPath(path);
  if (kind === 'config') return site ? 'Site configurations' : 'DA configurations';
  if (kind === 'content') return site ? 'All site content' : 'All sites';
  if (kind === 'folder') {
    const prefix = `/${site}/`;
    const rest = norm.slice(prefix.length);
    const folder = rest.slice(0, rest.length - '/ + **'.length);
    return `${folder}/`;
  }
  return path;
}

function ensureSlot(slotsMap, path, site) {
  const norm = normPath(path);
  if (!slotsMap.has(norm)) {
    slotsMap.set(norm, {
      path: norm,
      kind: scopeKind(norm, site),
      label: scopeLabel(norm, site),
      read: [],
      write: [],
      none: [],
      inheritedRead: [],
      inheritedWrite: [],
      inheritedNone: [],
    });
  }
  return slotsMap.get(norm);
}

function levelListKey(level) {
  if (level === 'read') return 'read';
  if (level === 'write') return 'write';
  return 'none';
}

function inheritedListKey(level) {
  if (level === 'read') return 'inheritedRead';
  if (level === 'write') return 'inheritedWrite';
  return 'inheritedNone';
}

function applyInheritance(slot, orgRules) {
  if (!slot) return;
  orgRules.forEach((orgRule) => {
    const level = actionsToLevel(orgRule.actions);
    const members = splitGroups(orgRule.groups);
    const direct = slot[levelListKey(level)];
    const inherited = members.filter((m) => !direct.includes(m));
    slot[inheritedListKey(level)].push(...inherited);
  });
}

/**
 * Group rules into display slots: one row per scope, with direct and
 * inherited members per level. Path variants (e.g. `/s/+**` and `/s/ + **`)
 * are merged into a single slot.
 * @param {Rule[]} rules
 * @param {string|null} site
 * @param {string|null} [pendingFolder]
 * @returns {Slot[]}
 */
export function buildSlots(rules, site, pendingFolder = null) {
  const slotsMap = new Map();
  const defaults = defaultPaths(site);
  defaults.forEach((path) => ensureSlot(slotsMap, path, site));

  const orgConfigRules = rules.filter((r) => normPath(r.path) === 'CONFIG');
  const orgContentRules = rules.filter((r) => normPath(r.path) === '/ + **');

  rules.forEach((rule) => {
    const norm = normPath(rule.path);
    if (site) {
      if (!norm.startsWith(`/${site}/`)) return;
    } else if (norm !== 'CONFIG' && norm !== '/ + **') {
      return;
    }
    const slot = ensureSlot(slotsMap, norm, site);
    const level = actionsToLevel(rule.actions);
    const members = splitGroups(rule.groups);
    slot[levelListKey(level)].push(...members);
  });

  if (site) {
    applyInheritance(slotsMap.get(`/${site}/CONFIG`), orgConfigRules);
    applyInheritance(slotsMap.get(normPath(`/${site}/+**`)), orgContentRules);
  }

  if (site && pendingFolder) {
    const folderPath = folderRulePath(site, pendingFolder);
    const existed = slotsMap.has(folderPath);
    const slot = ensureSlot(slotsMap, folderPath, site);
    if (!existed) slot.pending = true;
  }

  const orderedPaths = defaults.map((path) => normPath(path));
  const rest = [...slotsMap.keys()]
    .filter((path) => !orderedPaths.includes(path))
    .sort();
  return [...orderedPaths, ...rest].map((path) => slotsMap.get(path));
}

/**
 * Combine a known site list with sites mentioned in rule paths (e.g.
 * `/foo/...`), deduped and sorted.
 * @param {string[]} siteList
 * @param {Rule[]} rules
 * @returns {string[]}
 */
export function siteNames(siteList, rules) {
  const fromRules = rules
    .map((r) => normPath(r.path))
    .filter((path) => path.startsWith('/'))
    .map((path) => path.split('/'))
    .filter((parts) => parts.length >= 3 && parts[1])
    .map((parts) => parts[1]);
  return [...new Set([...siteList, ...fromRules])].sort();
}

const MEMBER_LIST_KEYS = [
  'read', 'write', 'none', 'inheritedRead', 'inheritedWrite', 'inheritedNone',
];

/**
 * Parse a pasted list of members, splitting on commas and/or newlines,
 * trimming whitespace, dropping blanks, and deduping exact repeats while
 * preserving first-seen order and casing.
 * @param {string} input
 * @returns {string[]}
 */
export function parseMembers(input) {
  const seen = new Set();
  const members = [];
  (input || '').split(/[,\n]/).map((m) => m.trim()).filter(Boolean).forEach((m) => {
    if (seen.has(m)) return;
    seen.add(m);
    members.push(m);
  });
  return members;
}

/**
 * Whether a config has a `permissions` sheet with a `data` array.
 * @param {object|null} config
 * @returns {boolean}
 */
export function hasPermissionsSheet(config) {
  return !!(config && config.permissions && Array.isArray(config.permissions.data));
}

/**
 * Add one or more members to a rule's `read`/`write`/`none` level at `path`,
 * creating the rule if it doesn't exist yet. Members already present in the
 * rule (compared case-insensitively) are skipped. Never mutates `config`.
 * @param {object} config
 * @param {string} path
 * @param {Level} level
 * @param {string[]} who
 * @returns {{ config: object, changed: boolean }}
 */
export function addMembers(config, path, level, who) {
  const next = structuredClone(config);
  if (!who || who.length === 0) return { config: next, changed: false };

  const actions = levelToActions(level);
  const normalizedPath = normPath(path);
  const sheet = next.permissions;
  const rule = sheet.data.find(
    (r) => normPath(r.path) === normalizedPath && r.actions === actions,
  );

  const current = rule ? splitGroups(rule.groups) : [];
  const seen = new Set(current.map((m) => m.toLowerCase()));
  const added = [];
  who.forEach((w) => {
    const key = w.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    added.push(w);
  });
  if (added.length === 0) return { config: next, changed: false };

  const merged = [...current, ...added].join(', ');
  if (rule) {
    rule.groups = merged;
  } else {
    sheet.data.push({ path: normalizedPath, groups: merged, actions });
  }
  sheet.total = sheet.data.length;
  sheet.limit = sheet.data.length;
  return { config: next, changed: true };
}

/**
 * Remove a single member from every rule matching `path`/`level` (including
 * path variants normalized to the same value), deleting a rule once it has
 * no members left. Never mutates `config`.
 * @param {object} config
 * @param {string} path
 * @param {Level} level
 * @param {string} who
 * @returns {{ config: object, changed: boolean }}
 */
export function removeMember(config, path, level, who) {
  const next = structuredClone(config);
  const actions = levelToActions(level);
  const normalizedPath = normPath(path);
  const sheet = next.permissions;

  let changed = false;
  const kept = [];
  sheet.data.forEach((rule) => {
    if (normPath(rule.path) !== normalizedPath || rule.actions !== actions) {
      kept.push(rule);
      return;
    }
    const current = splitGroups(rule.groups);
    const filtered = current.filter((m) => m !== who);
    if (filtered.length !== current.length) changed = true;
    if (filtered.length > 0) {
      rule.groups = filtered.join(', ');
      kept.push(rule);
    }
  });

  if (!changed) return { config: next, changed: false };

  sheet.data = kept;
  sheet.total = sheet.data.length;
  sheet.limit = sheet.data.length;
  return { config: next, changed: true };
}

/**
 * Filter slots by a case-insensitive query matched against the scope label,
 * path, or any direct/inherited member.
 * @param {Slot[]} slots
 * @param {string} query
 * @returns {Slot[]}
 */
export function filterSlots(slots, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return slots;
  return slots.filter((slot) => {
    if (slot.label.toLowerCase().includes(q)) return true;
    if (slot.path.toLowerCase().includes(q)) return true;
    return MEMBER_LIST_KEYS.some(
      (key) => (slot[key] || []).some((m) => m.toLowerCase().includes(q)),
    );
  });
}
