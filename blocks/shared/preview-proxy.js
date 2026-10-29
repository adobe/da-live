import { getLivePreviewUrl } from './constants.js';
import { livePreviewLogin } from './utils.js';
import { parseSiteUrl, parsePreviewUrl, parseDaUrl } from '../../scripts/urls.js';

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
    // Host-only compatibility here rewrites URLs, never authorizes credentials.
    const parsed = parseSiteUrl(input, fallback) || parsePreviewUrl(input, fallback)
      || parseDaUrl(input, undefined, true);
    if (parsed) {
      const {
        org, site, branch: sourceBranch, pathname, search, hash,
      } = parsed;
      const resolvedBranch = parsed.service ? branch : sourceBranch;
      return {
        url: buildPreviewUrl({
          org, site, branch: resolvedBranch, pathname, search, hash, getUrl,
        }),
        org,
        site,
        branch: resolvedBranch,
        pathname,
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
