import { getLivePreviewUrl } from './constants.js';
import { livePreviewLogin } from './utils.js';

const AEM_HOST = /\.(aem|hlx)\.(page|live)$/;

function isPreviewHost(hostname) {
  return hostname.includes('preview.da.live') || hostname.endsWith('.localhost');
}

function parseBranchHost(hostname) {
  const [branch, site, orgWithDomain] = hostname.split('--');
  if (!branch || !site || !orgWithDomain) return null;
  const [org] = orgWithDomain.split('.');
  if (!org) return null;
  return { org, site, branch };
}

function buildPreviewUrl({
  org, site, branch, pathname, search = '', hash = '', getUrl = getLivePreviewUrl,
}) {
  return `${getUrl(org, site, branch)}${pathname}${search}${hash}`;
}

export function getPreviewProxyDetails(input, fallback = {}) {
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
    if (hosted && (AEM_HOST.test(url.hostname) || isPreviewHost(url.hostname))) {
      return {
        url: buildPreviewUrl({ ...hosted, pathname, search, hash, getUrl }),
        ...hosted,
        pathname,
      };
    }

    if (url.hostname.includes('content.da.live')) {
      const [, org, site, ...rest] = url.pathname.split('/');
      if (!org || !site) return { url: input };
      const targetPath = `/${rest.join('/')}`;
      return {
        url: buildPreviewUrl({
          org, site, branch, pathname: targetPath, search: url.search, hash: url.hash, getUrl,
        }),
        org,
        site,
        branch,
        pathname: targetPath,
      };
    }

    if (url.hostname.includes('admin.da.live')) {
      const [, , org, site, ...rest] = url.pathname.split('/');
      if (!org || !site) return { url: input };
      const targetPath = `/${rest.join('/')}`;
      return {
        url: buildPreviewUrl({
          org, site, branch, pathname: targetPath, search: url.search, hash: url.hash, getUrl,
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

export function toPreviewProxyUrl(input, fallback) {
  return getPreviewProxyDetails(input, fallback).url;
}

export async function ensurePreviewProxySession(url, fallback = {}) {
  const { org, site, branch } = getPreviewProxyDetails(url, fallback);
  if (!org || !site) return;
  await livePreviewLogin(org, site, branch, fallback.getUrl);
}
