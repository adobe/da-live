import { DA_ORIGIN } from '../../../../../shared/constants.js';
import { daFetch, fetchDaConfigs } from '../../../../../shared/utils.js';

const configCache = {};

async function fetchOrgMsmRows(org) {
  const [orgConfig] = await Promise.all(fetchDaConfigs({ org }));
  return orgConfig?.msm?.data || [];
}

function getDirectChildren(rows, site) {
  return rows
    .filter((row) => row.base === site && row.satellite)
    .map((row) => ({ site: row.satellite, label: row.title || row.satellite }));
}

function getParentRow(rows, site) {
  return rows.find((row) => row.satellite === site);
}

function getBaseLabel(rows, site) {
  const labelRow = rows.find((row) => row.base === site && !row.satellite);
  return labelRow?.title;
}

function walkSubtree(rows, rootSite, visited = new Set()) {
  if (visited.has(rootSite)) return [];
  visited.add(rootSite);
  const children = getDirectChildren(rows, rootSite);
  return children.flatMap((child) => [
    child,
    ...walkSubtree(rows, child.site, visited),
  ]);
}

function walkChain(rows, site, visited = new Set()) {
  const chain = [];
  let current = site;
  while (current && !visited.has(current)) {
    visited.add(current);
    const parentRow = getParentRow(rows, current);
    if (!parentRow) break;
    const baseLabel = getBaseLabel(rows, parentRow.base) || parentRow.base;
    chain.unshift({ site: parentRow.base, label: baseLabel });
    current = parentRow.base;
  }
  return chain;
}

function resolveConfig(rows, site) {
  if (!rows.length || rows[0].base === undefined) return null;

  const directChildren = getDirectChildren(rows, site);
  const parentRow = getParentRow(rows, site);

  if (!directChildren.length && !parentRow) return null;

  const result = {};

  if (directChildren.length) {
    const satellites = directChildren.reduce((acc, child) => {
      const subtree = walkSubtree(rows, child.site);
      acc[child.site] = {
        label: child.label,
        descendantCount: subtree.length,
      };
      return acc;
    }, {});
    result.asBase = {
      baseLabel: getBaseLabel(rows, site),
      satellites,
    };
  }

  if (parentRow) {
    const chain = walkChain(rows, site);
    result.asSatellite = {
      base: parentRow.base,
      baseLabel: getBaseLabel(rows, parentRow.base) || parentRow.base,
      chain,
    };
  }

  return result;
}

async function fetchSiteConfig(org, site) {
  const key = `${org}/${site}`;
  if (configCache[key]) return configCache[key];

  const rows = await fetchOrgMsmRows(org);
  if (!rows.length) return null;

  const config = resolveConfig(rows, site);
  if (!config) return null;

  configCache[key] = { config, rows };
  return configCache[key];
}

export async function getSiteConfig(org, site) {
  const entry = await fetchSiteConfig(org, site);
  return entry?.config || null;
}

export async function getSubtreeSatellites(org, baseSite) {
  const entry = await fetchSiteConfig(org, baseSite);
  if (!entry) return [];
  return walkSubtree(entry.rows, baseSite);
}

export async function getSatellites(org, baseSite) {
  const config = await getSiteConfig(org, baseSite);
  return config?.asBase?.satellites || {};
}

export async function getBaseSite(org, satellite) {
  const config = await getSiteConfig(org, satellite);
  return config?.asSatellite?.base || null;
}

export async function isPageLocal(org, site, pagePath) {
  const resp = await daFetch(
    `${DA_ORIGIN}/source/${org}/${site}${pagePath}.html`,
    { method: 'HEAD' },
  );
  return resp.ok;
}

export async function checkOverrides(org, satellites, pagePath) {
  const entries = Object.entries(satellites);
  const results = await Promise.all(
    entries.map(async ([site, info]) => {
      const local = await isPageLocal(org, site, pagePath);
      return {
        site,
        label: info.label,
        descendantCount: info.descendantCount || 0,
        hasOverride: local,
      };
    }),
  );
  return results;
}

export function clearMsmCache() {
  Object.keys(configCache).forEach((key) => { delete configCache[key]; });
}
