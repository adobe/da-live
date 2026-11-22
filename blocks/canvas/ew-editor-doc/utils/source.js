import { getNx, getNx2Api, sanitizePathParts } from '../../../../scripts/utils.js';
import { daFetch } from '../../../shared/utils.js';
import { DA_ORIGIN } from '../../../shared/constants.js';
import { parseSiteSegment } from '../../../shared/content-branch-context.js';
import { validateBranch } from '../../../shared/branch-selector/context.js';
import { daRsSourceUrl, discoverDaRs, isDaRsBinding } from '../../../shared/da-rs-provider.js';

const { DA_ADMIN } = await import(`${getNx()}/utils/utils.js`);

export function normalizeSourcePath(path) {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.replace(/^\//, '').trim();
  return trimmed || null;
}

// Only the authorized, bound H6 branch document may expose a scoped local view.
export function isBoundHelixBranchDocument(context, sourceUrl) {
  if (!isDaRsBinding()) return false;
  try {
    const path = normalizeSourcePath(context?.path);
    if (!path) return false;
    sanitizePathParts(`/${path}`);
    const [org, site, ...parts] = path.split('/');
    const parsed = parseSiteSegment(site);
    const active = window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : '';
    if (!parsed.branch || org !== context.org || site !== context.repo || !parts.length
      || parts.some((part) => !part || /^[.]{1,2}$/.test(part))
      || /[?#\\]|%2f|%5c|%2e|%25/i.test(parts.join('/'))
      || active.replace(/\.html$/i, '') !== path.replace(/\.html$/i, '')) return false;
    const doc = parts.join('/');
    const binding = { origin: DA_ORIGIN, org, site: parsed.site, branch: parsed.branch, mode: 'helix6' };
    const expected = daRsSourceUrl(binding, `/${doc}${doc.endsWith('.html') ? '' : '.html'}`);
    return new URL(sourceUrl).href === new URL(expected).href;
  } catch {
    return false;
  }
}

export async function buildSourceUrl(path) {
  const trimmed = normalizeSourcePath(path);
  if (!trimmed) return null;
  const [org, site, ...parts] = trimmed.split('/');
  if (site && /[~%]/.test(site)) sanitizePathParts(`/${trimmed}`);
  if (site?.includes('~')) {
    const parsed = parseSiteSegment(site);
    const { hash, search } = window.location;
    if (isDaRsBinding()) {
      const activePath = hash.startsWith('#/') ? hash.slice(2).replace(/\.html$/i, '') : '';
      if (activePath !== trimmed.replace(/\.html$/i, '') || !parts.length
        || parts.some((part) => !part || /^[.]{1,2}$/.test(part))
        || /[?#\\]|%2f|%5c|%2e|%25/i.test(parts.join('/'))) throw new Error('da-rs context changed');
    }
    const { binding } = await validateBranch({ org, ...parsed, siteSegment: site });
    if (window.location.hash !== hash || window.location.search !== search) throw new Error('Branch context changed');
    if (binding?.mode === 'helix6') {
      const docPath = parts.join('/');
      return daRsSourceUrl({ ...binding, branch: parsed.branch }, `/${docPath}${docPath.endsWith('.html') ? '' : '.html'}`);
    }
    return `${DA_ORIGIN}/source/${trimmed}${trimmed.endsWith('.html') ? '' : '.html'}`;
  }
  if (isDaRsBinding()) {
    if (!parts.length || parts.some((part) => !part || /^[.]{1,2}$/.test(part))
      || /[?#\\]|%2f|%5c|%2e|%25/i.test(parts.join('/'))) {
      throw new Error('Invalid da-rs document path');
    }
    const { hash, search } = window.location;
    const activePath = hash.startsWith('#/') ? hash.slice(2).replace(/\.html$/i, '') : '';
    if (activePath !== trimmed.replace(/\.html$/i, '')) throw new Error('da-rs context changed');
    const binding = await discoverDaRs(org, site);
    if (!isDaRsBinding() || window.location.hash !== hash || window.location.search !== search) {
      throw new Error('da-rs context changed');
    }
    const docPath = parts.join('/');
    return daRsSourceUrl(binding, `/${docPath}${docPath.endsWith('.html') ? '' : '.html'}`);
  }
  const { AEM_API, isHlx6 } = await getNx2Api();
  if (org && site && parts.length && await isHlx6(org, site)) {
    return `${AEM_API}/${org}/sites/${site}/source/${parts.join('/')}.html`;
  }
  return `${DA_ADMIN}/source/${trimmed}.html`;
}

// da-admin keeps da-live's own fetcher, which reads the token live and retries once on a 401.
// nx2's is the one that allowlists api.aem.live for the bearer.
export async function checkDoc(sourceUrl) {
  const parsed = new URL(sourceUrl);
  if (isDaRsBinding() && parsed.origin === DA_ORIGIN) {
    const { href } = window.location;
    const response = await daFetch(sourceUrl, { method: 'HEAD', noRedirect: true, redirect: 'error' });
    if (window.location.href !== href) throw new Error('da-rs context changed');
    const match = parsed.pathname.match(/^\/[^/]+\/sites\/([^/]+)~([a-z0-9]{1,8})\/source\//);
    if (response.ok && match && (response.headers.get('content-branch') !== match[2]
      || response.headers.get('x-da-source-mode') !== 'helix6')) {
      return new Response('Invalid branch Source response', { status: 422 });
    }
    return response;
  }
  if (parsed.origin === DA_ORIGIN && parsed.pathname.split('/')[3]?.includes('~')) {
    return daFetch(sourceUrl, { method: 'HEAD', noRedirect: true, redirect: 'error' });
  }
  if (sourceUrl.startsWith(DA_ADMIN)) return daFetch(sourceUrl, { method: 'HEAD' });
  const { daFetch: nx2Fetch } = await getNx2Api();
  return nx2Fetch({ url: sourceUrl, opts: { method: 'HEAD' } });
}
