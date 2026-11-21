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

export async function buildSourceUrl(path) {
  const trimmed = normalizeSourcePath(path);
  if (!trimmed) return null;
  const [org, site, ...parts] = trimmed.split('/');
  if (site && /[~%]/.test(site)) sanitizePathParts(`/${trimmed}`);
  if (site?.includes('~')) {
    const parsed = parseSiteSegment(site);
    await validateBranch({ org, ...parsed, siteSegment: site });
    return `${DA_ORIGIN}/source/${trimmed}.html`;
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
    return daFetch(sourceUrl, { method: 'HEAD', noRedirect: true, redirect: 'error' });
  }
  if (parsed.origin === DA_ORIGIN && parsed.pathname.split('/')[3]?.includes('~')) {
    return daFetch(sourceUrl, { method: 'HEAD', noRedirect: true, redirect: 'error' });
  }
  if (sourceUrl.startsWith(DA_ADMIN)) return daFetch(sourceUrl, { method: 'HEAD' });
  const { daFetch: nx2Fetch } = await getNx2Api();
  return nx2Fetch({ url: sourceUrl, opts: { method: 'HEAD' } });
}
