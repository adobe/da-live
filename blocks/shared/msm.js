import { DA_ORIGIN } from './constants.js';
import { daFetch } from './utils.js';

const configCache = {};

async function fetchSiteConfig(org, site) {
  const key = `${org}/${site}`;
  if (configCache[key]) return configCache[key];

  const resp = await daFetch(`${DA_ORIGIN}/source/${org}/${site}/.da/msm.json`);
  if (!resp.ok) return null;
  const json = await resp.json();
  const rows = json.data || [];
  if (!rows.length) return null;

  let config;
  if (rows[0].satellite !== undefined) {
    const satellites = rows.reduce((acc, row) => {
      acc[row.satellite] = { label: row.satelliteLabel };
      return acc;
    }, {});
    config = { role: 'base', satellites };
  } else if (rows[0].base !== undefined) {
    config = { role: 'satellite', base: rows[0].base, baseLabel: rows[0].baseLabel };
  } else {
    return null;
  }

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
      return { site, label: info.label, hasOverride: local };
    }),
  );
  return results;
}

export function clearMsmCache() {
  Object.keys(configCache).forEach((key) => { delete configCache[key]; });
}
