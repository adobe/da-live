import { sanitizeName } from '../../../scripts/utils.js';

export function parseSubdomain(siteUrl) {
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const match = url.hostname.match(/^([^.]+)\.(?:hlx|aem)\.(?:live|page)$/);
  if (!match) return null;
  const [branch, site, org, ...extra] = match[1].split('--');
  if (extra.length || ![branch, site, org].every((part) => /^[a-z0-9][a-z0-9_-]*$/.test(part || ''))) return null;
  return `#/${sanitizeName(org, false)}/${sanitizeName(site, false)}`;
}

export function setRecentSite({ org, site }) {
  if (!site || site.startsWith('.')) return;
  const currentSites = JSON.parse(localStorage.getItem('da-sites') || '[]');
  if (!Array.isArray(currentSites)) throw new TypeError('Recent sites must be a list.');
  const siteString = `${org}/${site}`;
  if (currentSites[0] === siteString) return;
  const sites = [siteString, ...currentSites.filter((value) => value !== siteString)].slice(0, 8);
  localStorage.setItem('da-sites', JSON.stringify(sites));
}

export function hasOrgAdminGrant(response) {
  // Check the org CONFIG response itself, never a content-write or fallback permission.
  const actions = response.headers?.get('x-da-actions')?.split('=').pop().split(',');
  return response.ok && !!actions?.some((action) => action.trim() === 'write');
}
