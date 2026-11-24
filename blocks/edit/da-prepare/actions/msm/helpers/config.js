import { DA_ORIGIN } from '../../../../../shared/constants.js';
import { daFetch, fetchDaConfigs } from '../../../../../shared/utils.js';
import { getNx2Api } from '../../../../../../scripts/utils.js';
import paced from './pace.js';

const configCache = {};

async function fetchOrgMsmRows(org) {
  const [orgConfig] = await Promise.all(fetchDaConfigs({ org }));
  return orgConfig?.msm?.data || [];
}

function resolveConfig(rows, site) {
  const hasBaseCol = rows[0].base !== undefined;

  if (hasBaseCol) {
    const baseRows = rows.filter((row) => row.base === site);
    const satelliteRows = baseRows.filter((row) => row.satellite);
    if (satelliteRows.length) {
      const baseEntry = baseRows.find((row) => !row.satellite);
      const satellites = satelliteRows.reduce((acc, row) => {
        acc[row.satellite] = { label: row.title };
        return acc;
      }, {});
      return { role: 'base', baseLabel: baseEntry?.title, satellites };
    }
    const satRow = rows.find((row) => row.satellite === site);
    if (satRow) {
      const baseEntry = rows.find((row) => row.base === satRow.base && !row.satellite);
      return { role: 'satellite', base: satRow.base, baseLabel: baseEntry?.title };
    }
    return null;
  }

  const isSatellite = rows.some((row) => row.satellite === site);
  if (isSatellite) return null;

  const satellites = rows.reduce((acc, row) => {
    if (row.satellite) acc[row.satellite] = { label: row.title };
    return acc;
  }, {});
  return Object.keys(satellites).length ? { role: 'base', satellites } : null;
}

async function fetchSiteConfig(org, site) {
  const key = `${org}/${site}`;
  if (configCache[key]) return configCache[key];

  const rows = await fetchOrgMsmRows(org);
  if (!rows.length) return null;

  const config = resolveConfig(rows, site);
  if (!config) return null;

  configCache[key] = config;
  return config;
}

export async function getSatellites(org, baseSite) {
  const config = await fetchSiteConfig(org, baseSite);
  if (!config) return {};
  if (config.role === 'base') return config.satellites;
  return {};
}

export async function getBaseSite(org, satellite) {
  const config = await fetchSiteConfig(org, satellite);
  if (!config) return null;
  if (config.role === 'satellite') return config.base;
  return null;
}

// Legacy DA source calls go to the editor's DA origin, which Merge and the
// editor use too. nx2 picks its own DA_ADMIN, which differs on da.page and on
// branch hosts.
export function legacySource(org, site, path, opts = {}) {
  return daFetch(`${DA_ORIGIN}/source/${org}/${site}${path}`, { ...opts, noRedirect: true });
}

// nx2 keeps a failed backend check until the page reloads (da-nx hlx6probe
// changes that), so trying again in the panel can't help.
export async function siteIsHlx6(org, site) {
  const { isHlx6 } = await getNx2Api();
  try {
    return await isHlx6(org, site);
  } catch (e) {
    throw new Error(`Could not check whether ${site} runs on Helix 6 (${e.message}). If this keeps happening, reload the page`);
  }
}

export function siteBackends(org, base, satellite) {
  return Promise.all([siteIsHlx6(org, base), siteIsHlx6(org, satellite)]);
}

// Only a 404 means the satellite has no page of its own. Any other failure
// throws: reading it as "inherited" would offer Cancel inheritance, which
// overwrites the page.
export async function isPageLocal(org, site, pagePath) {
  const { source } = await getNx2Api();
  const path = `${pagePath}.html`;
  const head = await siteIsHlx6(org, site)
    ? () => source.getMetadata({ org, site, path })
    : () => legacySource(org, site, path, { method: 'HEAD' });
  const resp = await paced(head);
  if (resp?.status === 404) return false;
  if (!resp?.ok) throw new Error(`Could not check the page on ${site} (${resp?.status ?? 0})`);
  return true;
}

export async function inheritsFromBase(org, base, satellite) {
  return !(await siteBackends(org, base, satellite)).some(Boolean);
}

export async function checkOverrides(org, satellites, pagePath) {
  const entries = Object.entries(satellites);
  const results = await Promise.all(
    entries.map(async ([site, info]) => {
      const local = await isPageLocal(org, site, pagePath);
      return { site, label: info.label, hasOverride: local };
    }),
  );
  return results;
}

export function clearMsmCache() {
  Object.keys(configCache).forEach((key) => { delete configCache[key]; });
}
