import { getNx, getNx2Api } from '../../../../scripts/utils.js';

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

export async function checkDoc(sourceUrl) {
  const { daFetch } = await getNx2Api();
  return daFetch({ url: sourceUrl, opts: { method: 'HEAD' } });
}
