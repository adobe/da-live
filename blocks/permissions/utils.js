const WILDCARD_SUFFIX_RE = /\s*\+\s*\*\*\s*$/;
const WILDCARD_SUFFIX = ' + **';
const FOLDER_SUFFIX = `/${WILDCARD_SUFFIX}`;

function normPath(path) {
  return path?.replace(WILDCARD_SUFFIX_RE, WILDCARD_SUFFIX);
}

function splitGroups(groups, separator = ',') {
  return (groups || '')
    .split(separator)
    .map((g) => g.trim())
    .filter(Boolean);
}

function actionsToLevel(actions) {
  if (actions === 'read') return 'read';
  if (actions === 'write') return 'write';
  return 'none';
}

function levelToActions(level) {
  if (level === 'read') return 'read';
  if (level === 'write') return 'write';
  return '';
}

const LEVELS = ['read', 'write', 'none'];

export const INHERITED_KEY = { read: 'inheritedRead', write: 'inheritedWrite', none: 'inheritedNone' };

export const LEVEL_LABEL = { read: 'Read', write: 'Write', none: 'None' };

function defaultPaths(site) {
  if (!site) return ['CONFIG', '/ + **'];
  return [`/${site}/CONFIG`, normPath(`/${site}/+**`)];
}

export function folderRulePath(site, folder) {
  return normPath(`/${site}/${folder}/+**`);
}

export function parseFolderPath(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return { error: 'Enter a folder path, e.g. /blog.' };
  if (!trimmed.startsWith('/')) return { error: 'Folder paths start with /, e.g. /blog.' };
  const folder = trimmed.split('/').filter(Boolean).join('/');
  if (!folder) return { error: 'Enter a folder below the site root, e.g. /blog.' };
  if (folder.split('/').some((segment) => segment === '.' || segment === '..' || segment.includes('*'))) {
    return { error: 'Folder paths cannot contain traversal or wildcard segments.' };
  }
  return { folder };
}

// A page's images live in its media folder `.{page}/`. An exact page rule doesn't cover that
// folder itself in da-admin, so it gets its own rule. Sheets and DA's own dot folders
// (`.da/`, `.trash/`, ...) aren't a page's media folder. da-admin drops spaces from rule paths.
const RESERVED_DOT_FOLDERS = ['da', 'da-versions', 'helix', 'snapshots', 'trash', 'versions'];

export function mediaRulePath(pagePath) {
  const path = pagePath.replace(/ /g, '');
  const isHtml = path.endsWith('.html');
  const page = isHtml ? path.slice(0, -'.html'.length) : path;
  const slash = page.lastIndexOf('/');
  const name = page.slice(slash + 1);
  if (!name || name.startsWith('.') || RESERVED_DOT_FOLDERS.includes(name)) return null;
  if (!isHtml && name.includes('.')) return null;
  return normPath(`${page.slice(0, slash + 1)}.${name}/+**`);
}

// da-admin lowercases request paths and drops spaces from rule paths, so only names DA can
// create would match. Pages keep .html: an exact rule without it also matches the folder.
const PAGE_SEGMENT_RE = /^[a-z0-9_-][a-z0-9._-]*$/;

export function parsePagePath(value) {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return { error: 'Enter a page path, e.g. /about.' };
  if (!trimmed.startsWith('/')) return { error: 'Page paths start with /, e.g. /about.' };
  const segments = trimmed.split('/').filter(Boolean);
  if (!segments.length) return { error: 'Enter a page below the site root, e.g. /about.' };
  if (trimmed.endsWith('/')) return { error: 'Page paths cannot end with /. Choose Folder to add a folder.' };
  if (segments.some((segment) => !PAGE_SEGMENT_RE.test(segment))) {
    return { error: 'Page paths can only use letters, numbers, -, _ and dots, and no part can start with a dot.' };
  }
  const page = segments.join('/');
  return { page: segments.at(-1).includes('.') ? page : `${page}.html` };
}

function scopeKind(path, site) {
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
  if (norm.endsWith(FOLDER_SUFFIX)) return 'folder';
  const effective = norm.replace(/ /g, '');
  if (effective === `${prefix}CONFIG` || effective.includes('*') || effective.endsWith('/')) return 'other';
  return 'page';
}

export function scopeLabel(path, site) {
  const kind = scopeKind(path, site);
  if (kind === 'config') return site ? 'Site configurations' : 'DA configurations';
  if (kind === 'content') return site ? 'All site content' : 'All sites';
  if (kind === 'folder') {
    const norm = normPath(path);
    return `${norm.slice(`/${site}/`.length, -FOLDER_SUFFIX.length)}/`;
  }
  if (kind === 'page') return path.slice(`/${site}/`.length);
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

function applyInheritance(slot, orgRules) {
  if (!slot) return;
  orgRules.forEach((orgRule) => {
    const level = actionsToLevel(orgRule.actions);
    const members = splitGroups(orgRule.groups);
    const direct = slot[level];
    const inherited = members.filter((m) => !direct.includes(m));
    slot[INHERITED_KEY[level]].push(...inherited);
  });
}

export function buildSlots(rules, site, pendingPath = null) {
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
    slot[level].push(...members);
  });

  if (site) {
    applyInheritance(slotsMap.get(`/${site}/CONFIG`), orgConfigRules);
    applyInheritance(slotsMap.get(normPath(`/${site}/+**`)), orgContentRules);
  }

  if (site && pendingPath) {
    const existed = slotsMap.has(pendingPath);
    const slot = ensureSlot(slotsMap, pendingPath, site);
    if (!existed) slot.pending = true;
  }

  const orderedPaths = defaults.map((path) => normPath(path));
  const rest = [...slotsMap.keys()]
    .filter((path) => !orderedPaths.includes(path))
    .sort();
  return [...orderedPaths, ...rest].map((path) => slotsMap.get(path));
}

export function siteNames(siteList, rules) {
  const fromRules = rules
    .map((r) => normPath(r.path))
    .filter((path) => path.startsWith('/'))
    .map((path) => path.split('/'))
    .filter((parts) => parts.length >= 3 && parts[1])
    .map((parts) => parts[1]);
  return [...new Set([...siteList, ...fromRules])].sort();
}

export function parseMembers(input) {
  return [...new Set(splitGroups(input, /[,\n]/))];
}

function syncSheetCounts(sheet) {
  sheet.total = sheet.data.length;
  sheet.limit = sheet.data.length;
}

export function hasPermissionsSheet(config) {
  return !!(config && config.permissions && Array.isArray(config.permissions.data));
}

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
  syncSheetCounts(sheet);
  return { config: next, changed: true };
}

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
    const filtered = current.filter((m) => m.toLowerCase() !== who.toLowerCase());
    if (filtered.length !== current.length) changed = true;
    if (filtered.length > 0) {
      rule.groups = filtered.join(', ');
      kept.push(rule);
    }
  });

  if (!changed) return { config: next, changed: false };

  sheet.data = kept;
  syncSheetCounts(sheet);
  return { config: next, changed: true };
}

// A change to a page also goes to its media folder rule.
export function scopePaths(path, site) {
  const media = scopeKind(path, site) === 'page' && mediaRulePath(path);
  return media ? [path, media] : [path];
}

export function updateScope(config, paths, update) {
  return paths.reduce((acc, path) => {
    const result = update(acc.config, path);
    return { config: result.config, changed: acc.changed || result.changed };
  }, { config, changed: false });
}

const MIN_QUERY_LENGTH = 2;

// The normalized filter text, or '' while it's too short to filter on.
export function activeQuery(query) {
  const q = (query || '').trim().toLowerCase();
  return q.length >= MIN_QUERY_LENGTH ? q : '';
}

// Scopes whose label or path match keep all members. Otherwise only matching members stay,
// and `hidden` counts the rest per level so the UI can say members are filtered out.
export function filterSlots(slots, query) {
  const q = activeQuery(query);
  if (!q) return slots;
  return slots.flatMap((slot) => {
    if (slot.label.toLowerCase().includes(q) || slot.path.toLowerCase().includes(q)) return [slot];
    const next = { ...slot, hidden: { read: 0, write: 0, none: 0 } };
    LEVELS.forEach((level) => {
      [level, INHERITED_KEY[level]].forEach((key) => {
        next[key] = slot[key].filter((m) => m.toLowerCase().includes(q));
        next.hidden[level] += slot[key].length - next[key].length;
      });
    });
    const matched = LEVELS.some((level) => next[level].length || next[INHERITED_KEY[level]].length);
    return matched ? [next] : [];
  });
}
