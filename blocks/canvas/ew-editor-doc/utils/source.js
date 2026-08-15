import { getNx, getNx2Api } from '../../../../scripts/utils.js';
import { daFetch } from '../../../shared/utils.js';

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
  const { AEM_API, isHlx6 } = await getNx2Api();
  if (org && site && parts.length && await isHlx6(org, site)) {
    return `${AEM_API}/${org}/sites/${site}/source/${parts.join('/')}.html`;
  }
  return `${DA_ADMIN}/source/${trimmed}.html`;
}

// da-admin keeps da-live's own fetcher, which reads the token live and retries once on a 401.
// nx2's is the one that allowlists api.aem.live for the bearer.
export async function checkDoc(sourceUrl) {
  if (sourceUrl.startsWith(DA_ADMIN)) return daFetch(sourceUrl, { method: 'HEAD' });
  const { daFetch: nx2Fetch } = await getNx2Api();
  return nx2Fetch({ url: sourceUrl, opts: { method: 'HEAD' } });
}
