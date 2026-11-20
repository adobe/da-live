import { parseSiteSegment } from '../content-branch-context.js';
import { discoverBranching, defaultSourceMatchesBinding } from '../branch-selector/context.js';

export function matchesDefaultSite(org, site, hash = window.location.hash) {
  try {
    const parts = hash.startsWith('#/') ? hash.slice(2).split('/') : [];
    return !!org && !!site && parts[0] === org && parts[1] === site
      && parseSiteSegment(site).branch === null;
  } catch {
    return false;
  }
}

export async function historyAvailable(org, site, dependencies = {}) {
  const { matchesBinding = defaultSourceMatchesBinding } = dependencies;
  const { discover = discoverBranching } = dependencies;
  try {
    if (!org || !site || parseSiteSegment(site).branch !== null) return false;
    if (!await matchesBinding(org, site)) return false;
    return (await discover(org, site)).status === 'available';
  } catch {
    return false;
  }
}

export async function openSiteHistory(org, site) {
  if (!matchesDefaultSite(org, site)) return;
  const { hash } = window.location;
  if (!await historyAvailable(org, site) || window.location.hash !== hash) return;
  await import('./site-history.js');
  if (window.location.hash !== hash || !matchesDefaultSite(org, site)) return;
  document.querySelector('da-site-history')?.remove();
  const element = document.createElement('da-site-history');
  element.org = org;
  element.site = site;
  document.body.append(element);
}
