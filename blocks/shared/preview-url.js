import { fetchDaConfigs, getFirstSheet } from './utils.js';

/** The hostname form used by both the preview proxy and AEM delivery hosts. */
export function normalizeBranch(branch = 'main') {
  return branch.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

export function getPreviewOrigin(org, repo, branch = 'main') {
  const hostname = window?.location?.hostname ?? '';
  const domain = hostname.endsWith('aem.page') || hostname.endsWith('localhost')
    ? 'stage-preview.da.live'
    : 'preview.da.live';
  return `https://${normalizeBranch(branch)}--${repo}--${org}.${domain}`;
}

export async function fetchWysiwygBranch({ org, site, path }) {
  if (!org || !site) return 'main';
  const branchParam = new URLSearchParams(window.location.search).get('ref');
  if (branchParam && branchParam !== 'local') return normalizeBranch(branchParam);

  const configs = await Promise.all(fetchDaConfigs({ org, site }));
  const rows = configs.filter((c) => {
    if (c?.error) {
      // eslint-disable-next-line no-console
      console.warn(c.error, c.status);
      return false;
    }
    return Boolean(c);
  }).reverse().flatMap((c) => getFirstSheet(c) || []);
  const branchRows = rows.filter((r) => r?.key === 'ew.wysiwygBranch'
    && typeof r.value === 'string');
  if (!branchRows.length) return 'main';

  const fullPath = path ? `/${path}` : `/${org}/${site}`;
  const matched = branchRows
    .map((row) => {
      const eqIdx = row.value.indexOf('=');
      if (eqIdx === -1) return null;
      return {
        prefix: row.value.slice(0, eqIdx).replace(/\/+$/, ''),
        branch: row.value.slice(eqIdx + 1).trim(),
      };
    })
    .filter((entry) => entry?.branch
      && (fullPath === entry.prefix || fullPath.startsWith(`${entry.prefix}/`)))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return normalizeBranch(matched?.branch || 'main');
}
