import { getNx } from '../../../../scripts/utils.js';
import { getAuthToken, isValidHref } from '../../../shared/utils.js';

const { fetchDaConfigs, getFirstSheet } = await import(`${getNx()}/utils/daConfig.js`);

const ref = new URLSearchParams(window.location.search).get('ref') || 'main';

/** The visual enum. Anything else is coerced to the first entry. */
export const STATES = ['neutral', 'pending', 'positive', 'negative'];

/** One plugin call may take this long before its surface is declared dead. */
export const STATUS_TIMEOUT_MS = 5000;

/** The host's default icon, shipped with this repo at img/icons/. */
export const DEFAULT_ICON = 'workflow';

/**
 * Icon names the host knows how to resolve. A name outside this set falls
 * silently through the chain (status icon -> row icon -> DEFAULT_ICON), which
 * is the only way to honor "an unknown name falls through" without fetching
 * every candidate. It also keeps a plugin-supplied string out of the
 * `<use href>` path.
 */
export const KNOWN_ICONS = new Set([
  'cancel',
  'checkmarkcircle',
  'clock',
  'comment',
  'flag',
  'history',
  'infocircle',
  'send',
  'user',
  DEFAULT_ICON,
]);

/** The host's closed item classification, keyed by file extension. */
const KIND_BY_EXT = { html: 'page', json: 'sheet' };
const KINDS = ['page', 'sheet', 'media'];
const DEFAULT_KINDS = ['page'];

/** Maps a list item's extension onto the kind a plugin declares in `kinds`. */
export function kindForExt(extension) {
  if (!extension || extension === 'link') return null;
  return KIND_BY_EXT[extension] || 'media';
}

function normalizeName(title) {
  return title.trim().toLowerCase().replaceAll(' ', '-');
}

function isPluginAllowed(rowRef) {
  const pluginRef = rowRef || 'main';
  if (pluginRef === 'main') return true;
  if (ref === 'local') return true;
  return pluginRef === ref;
}

/** Resolves a declared module path the way the canvas plugin surface does. */
export function resolveModuleUrl(org, site, modulePath) {
  const trimmed = modulePath.trim();
  if (!trimmed.startsWith('/')) return trimmed;
  if (ref === 'local') return `http://localhost:3000${trimmed}`;
  return `https://${ref}--${site}--${org}.aem.live${trimmed}`;
}

function parseKinds(value) {
  if (!value) return DEFAULT_KINDS;
  const kinds = value.split(',')
    .map((kind) => kind.trim().toLowerCase())
    .filter((kind) => KINDS.includes(kind));
  return kinds.length ? kinds : DEFAULT_KINDS;
}

/**
 * Turns the `library` rows of the org and site configs into status rows:
 * deduped by `surface + name`, site rows ahead of org rows, `ref` already
 * applied. Rows a plugin cannot use are dropped here, before any import.
 */
export function toStatusRows(configs, { org, site }) {
  const valid = configs.filter((config) => config && !config.error).reverse();
  const rows = valid.flatMap((config) => config?.library?.data || getFirstSheet(config) || []);

  const seen = new Set();
  return rows.reduce((acc, row) => {
    if (row?.surface?.trim().toLowerCase() !== 'status') return acc;
    if (!row.title?.trim() || !row.module?.trim()) return acc;
    if (!isPluginAllowed(row.ref)) return acc;

    const name = normalizeName(row.title);
    if (seen.has(name)) return acc;
    seen.add(name);

    acc.push({
      name,
      heading: row.label?.trim() || row.title.trim(),
      icon: row.icon?.trim() || '',
      kinds: parseKinds(row.kinds),
      requires: row.requires?.trim().toLowerCase() || '',
      url: resolveModuleUrl(org, site, row.module),
    });
    return acc;
  }, []);
}

function pickIcon(...candidates) {
  return candidates.find((name) => KNOWN_ICONS.has(name)) || DEFAULT_ICON;
}

function toDetail(detail) {
  if (!Array.isArray(detail)) return undefined;
  const rows = detail.reduce((acc, entry) => {
    const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
    if (!label || entry.value === undefined || entry.value === null) return acc;
    acc.push({ label, value: String(entry.value) });
    return acc;
  }, []);
  return rows.length ? rows : undefined;
}

/** Resolves what `call` resolves, or rejects once `ms` has passed. */
function withBudget(call, ms) {
  let timer;
  const budget = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`exceeded ${ms}ms`)), ms);
  });
  return Promise.race([call, budget]).finally(() => clearTimeout(timer));
}

/**
 * The status registry for one `da-list` instance.
 *
 * Its only public method is `getContributions(item)`: config, handles and the
 * dead-surface bookkeeping stay private, so a list item cannot reach past the
 * status it asked for. Build one per org/site and drop it with the list.
 */
export default function createStatusRegistry({
  org,
  site,
  path,
  permissions,
  getToken = getAuthToken,
  loadModule = (url) => import(url),
} = {}) {
  const handles = new Map();
  const deadStatus = new Set();
  const warned = new Set();

  const rowsPromise = (async () => {
    if (!org || !site) return [];
    try {
      const configs = await Promise.all(fetchDaConfigs({ org, site }));
      return toStatusRows(configs, { org, site });
    } catch {
      return [];
    }
  })();

  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    // eslint-disable-next-line no-console
    console.warn(`[da-status] ${message}`);
  }

  function canUse(row) {
    if (row.requires !== 'write') return true;
    return !!permissions?.some((permission) => permission === 'write');
  }

  /**
   * One import and one `init` per module URL. A failed import or a throwing
   * `init` kills every surface this module could have contributed, for the
   * life of this registry.
   */
  function getHandle(row) {
    if (!handles.has(row.url)) {
      handles.set(row.url, (async () => {
        const mod = await loadModule(row.url);
        const init = mod?.default;
        if (typeof init !== 'function') throw new Error('no default export');
        const handle = await init({
          context: { org, site, path, ref },
          token: await getToken(),
        });
        if (!handle || typeof handle !== 'object') throw new Error('init returned no handle');
        return handle;
      })().catch((e) => {
        warnOnce(`init:${row.url}`, `"${row.name}" failed to load: ${e.message}`);
        return null;
      }));
    }
    return handles.get(row.url);
  }

  /** Applies the failure table to whatever a plugin handed back. */
  function normalizeStatus(row, raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'object') {
      warnOnce(`shape:${row.url}`, `"${row.name}" returned a ${typeof raw} rather than a status object.`);
      return null;
    }
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    if (!label) {
      warnOnce(`label:${row.url}`, `"${row.name}" returned a status with no label.`);
      return null;
    }
    let { state } = raw;
    if (!STATES.includes(state)) {
      warnOnce(`state:${row.url}`, `"${row.name}" returned an unknown state "${state}". Using "${STATES[0]}".`);
      [state] = STATES;
    }
    return {
      state,
      label,
      icon: pickIcon(raw.icon, row.icon),
      detail: toDetail(raw.detail),
      href: isValidHref(raw.href) ? raw.href : undefined,
    };
  }

  async function contribute(row, item, ctx) {
    if (deadStatus.has(row.url)) return null;
    const handle = await getHandle(row);
    if (typeof handle?.getStatus !== 'function') return null;
    try {
      const raw = await withBudget(handle.getStatus(item, ctx), STATUS_TIMEOUT_MS);
      const status = normalizeStatus(row, raw);
      return status && { name: row.name, heading: row.heading, status };
    } catch (e) {
      // Only this surface dies. The same handle keeps serving the action bar.
      deadStatus.add(row.url);
      warnOnce(`status:${row.url}`, `"${row.name}" status is disabled for this session: ${e.message}`);
      return null;
    }
  }

  return {
    /**
     * Every plugin's status for one item, in config order, site rows first.
     * Plugins with nothing to say about this item are simply absent, and so
     * are plugins whose status surface died: the caller cannot tell them apart,
     * and renders nothing either way.
     */
    async getContributions(item) {
      const kind = kindForExt(item?.ext);
      if (!kind) return [];
      const rows = (await rowsPromise)
        .filter((row) => row.kinds.includes(kind) && canUse(row));
      if (!rows.length) return [];

      const ctx = { org, site, path, permissions, token: await getToken() };
      const contributions = await Promise.all(rows.map((row) => contribute(row, item, ctx)));
      return contributions.filter(Boolean);
    },
  };
}
