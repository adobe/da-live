import { getLivePreviewUrl } from './constants.js';
import { livePreviewLogin } from './utils.js';
import { getServiceHosts, getServiceOrigins, isAemHost, isPreviewHost } from '../../scripts/config.js';

function parseBranchHost(hostname) {
  const [branch, site, orgWithDomain] = hostname.split('--');
  if (!branch || !site || !orgWithDomain) return null;
  const [org] = orgWithDomain.split('.');
  return org ? { org, site, branch } : null;
}

function buildPreviewUrl({
  org, site, branch, pathname, search = '', hash = '', getUrl = getLivePreviewUrl,
}) {
  return `${getUrl(org, site, branch)}${pathname}${search}${hash}`;
}

function resolvePreviewProxyDetails(input, fallback) {
  if (typeof input !== 'string' || !input) return { url: input };
  if (input.startsWith('#') || input.includes('.svg#')) return { url: input };

  const branch = fallback.branch || 'main';
  const { getUrl } = fallback;

  if (input.startsWith('/')) {
    const { org, site } = fallback;
    if (!org || !site) return { url: input };
    return {
      url: buildPreviewUrl({ org, site, branch, pathname: input, getUrl }),
      org,
      site,
      branch,
      pathname: input,
    };
  }

  try {
    const url = new URL(input);
    const hosted = parseBranchHost(url.hostname);
    const { pathname, search, hash } = url;
    if (hosted && (isAemHost(url.hostname) || isPreviewHost(url.hostname))) {
      return {
        url: buildPreviewUrl({ ...hosted, pathname, search, hash, getUrl }),
        ...hosted,
        pathname,
      };
    }

    const contentHosts = getServiceHosts('content');
    const adminHosts = getServiceHosts('admin');
    // Host-only compatibility rewrites URLs; credentials use exact origins elsewhere.
    const isContent = getServiceOrigins('content').includes(url.origin)
      || (contentHosts.has(url.hostname) && !adminHosts.has(url.hostname));
    const isAdmin = getServiceOrigins('admin').includes(url.origin)
      || (adminHosts.has(url.hostname) && !contentHosts.has(url.hostname));
    if (isContent || isAdmin) {
      const parts = pathname.slice(1).split('/');
      if (!isContent) parts.shift();
      const [org, site, ...rest] = parts;
      if (!org || !site) return { url: input };
      const targetPath = `/${rest.join('/')}`;
      return {
        url: buildPreviewUrl({
          org, site, branch, pathname: targetPath, search, hash, getUrl,
        }),
        org,
        site,
        branch,
        pathname: targetPath,
      };
    }
  } catch {
    return { url: input };
  }

  return { url: input };
}

/**
 * Resolve a plugin/extension URL to its DA preview proxy equivalent.
 * When `fallback.currentOrg` is set, URLs belonging to a different org are
 * returned unchanged: the user may not have access to that org, and a public
 * cross-org plugin keeps working at its original URL.
 */
export function getPreviewProxyDetails(input, fallback = {}) {
  const details = resolvePreviewProxyDetails(input, fallback);
  const { currentOrg } = fallback;
  if (currentOrg && details.org && details.org.toLowerCase() !== currentOrg.toLowerCase()) {
    return { url: input };
  }
  return details;
}

export function toPreviewProxyUrl(input, fallback) {
  return getPreviewProxyDetails(input, fallback).url;
}

/** Return whether a proxy session was established; callers must not cache a refusal. */
export async function ensurePreviewProxySession(url, fallback = {}) {
  const { org, site, branch } = getPreviewProxyDetails(url, fallback);
  if (!org || !site) return false;
  return livePreviewLogin(org, site, branch, fallback.getUrl);
}
