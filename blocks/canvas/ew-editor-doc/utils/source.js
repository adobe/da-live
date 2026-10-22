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
async function fetchSource(sourceUrl, opts) {
  if (sourceUrl.startsWith(DA_ADMIN)) return daFetch(sourceUrl, opts);
  const { daFetch: nx2Fetch } = await getNx2Api();
  return nx2Fetch({ url: sourceUrl, opts });
}

export function checkDoc(sourceUrl) {
  return fetchSource(sourceUrl, { method: 'HEAD' });
}

export function fetchDoc(sourceUrl) {
  return fetchSource(sourceUrl, { cache: 'no-store' });
}

export async function saveDoc(path, body) {
  const normalized = normalizeSourcePath(path);
  if (!normalized) throw new Error('Cannot save a document without a source path.');
  const { source } = await getNx2Api();
  return source.save(`/${normalized}.html`, { body });
}
