import { getNx, getNx2, getNx2Api } from '../../../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../../shared/constants.js';
import { daFetch } from '../../../../../shared/utils.js';
import { inheritsFromBase, legacySource } from './config.js';
import paced from './pace.js';

async function call(task, fallback) {
  try {
    const resp = await paced(task);
    if (resp?.ok) return { ok: true, resp };
    const status = resp?.status ?? 0;
    return { error: resp?.headers?.get('x-error') || `${fallback} (${status})` };
  } catch (e) {
    return { error: `${fallback} (${e.message})` };
  }
}

async function aemAction(action, org, site, pagePath, fallback) {
  const { aem } = await getNx2Api();
  const path = pagePath.replace('.html', '');
  const result = await call(() => aem[action]({ org, site, path }), fallback);
  if (result.error) return result;
  return result.resp.json().catch(() => ({}));
}

export function previewSatellite(org, satellite, pagePath) {
  return aemAction('preview', org, satellite, pagePath, 'Preview failed');
}

export function publishSatellite(org, satellite, pagePath) {
  return aemAction('publish', org, satellite, pagePath, 'Publish failed');
}

export async function createOverride(org, base, satellite, pagePath) {
  const path = `${pagePath}.html`;
  const { isHlx6, source } = await getNx2Api();
  const [baseHlx6, satelliteHlx6] = await Promise.all([
    isHlx6(org, base),
    isHlx6(org, satellite),
  ]);

  // DA admin's /copy answers 204 even when the source is missing or the write
  // fails, so a legacy pair reads and writes the page itself.
  if (!baseHlx6 && !satelliteHlx6) {
    const read = await call(() => legacySource(org, base, path), 'Failed to fetch base content');
    if (read.error) return read;
    const body = new FormData();
    body.append('data', new Blob([await read.resp.text()], { type: 'text/html' }));
    const save = await call(
      () => legacySource(org, satellite, path, { method: 'PUT', body }),
      'Failed to create override',
    );
    return save.error ? save : { ok: true };
  }

  // nx2 reads or writes the legacy side of a mixed pair in its own DA
  // environment, so the copy only runs when that is the editor's too.
  if (baseHlx6 !== satelliteHlx6) {
    const { DA_ADMIN } = await import(`${getNx2()}/utils/utils.js`);
    if (DA_ADMIN !== DA_ORIGIN) {
      return { error: `Can't copy between a Helix 6 and a DA site in this DA environment (${DA_ORIGIN}, nx2 uses ${DA_ADMIN})` };
    }
  }

  const result = await call(() => source.copy({
    org,
    site: base,
    path,
    destination: `/${org}/${satellite}${path}`,
  }), 'Failed to create override');
  return result.error ? result : { ok: true };
}

export async function getSatellitePageStatus(org, satellite, pagePath) {
  const { status } = await getNx2Api();
  const path = pagePath.replace('.html', '');
  const result = await call(() => status.get({ org, site: satellite, path }), 'Status failed');
  if (result.error) throw new Error(result.error);
  // 404 means the rendition doesn't exist. Anything else (e.g. a 403 inside a
  // 200 response) leaves it unknown, and resume inheritance must not go on.
  const { preview, live } = await result.resp.json();
  if (![preview?.status, live?.status].every((code) => code === 200 || code === 404)) {
    throw new Error(`Could not check preview and publish status for ${satellite}`);
  }
  return {
    preview: preview.status === 200,
    live: live.status === 200,
  };
}

export async function deleteOverride(org, satellite, pagePath) {
  const { isHlx6, source } = await getNx2Api();
  const path = `${pagePath}.html`;
  const remove = await isHlx6(org, satellite)
    ? () => source.delete({ org, site: satellite, path })
    : () => legacySource(org, satellite, path, { method: 'DELETE' });
  const result = await call(remove, 'Failed to delete override');
  return result.error ? result : { ok: true };
}

let mergeCopyFn;
export function setMergeCopy(fn) { mergeCopyFn = fn; }

export async function mergeFromBase(org, base, satellite, pagePath) {
  try {
    if (!await inheritsFromBase(org, base, satellite)) {
      return { error: 'Merge isn\'t available for Helix 6 sites yet, use Override' };
    }

    // da-nx moved mergeCopy to its public loc SDK (adobe/da-nx#801). It only
    // exists under nx/, never nx2/, whatever nx version the page runs.
    const nx = getNx();
    const locNx = nx.endsWith('/nx2') ? nx.slice(0, -1) : nx;
    const mergeCopy = mergeCopyFn
      || (await import(`${locNx}/public/loc/index.js`)).mergeCopy;

    const result = await mergeCopy({
      fetch: daFetch,
      daOrigin: DA_ORIGIN,
      urlSource: `/${org}/${base}${pagePath}.html`,
      urlTarget: `/${org}/${satellite}${pagePath}.html`,
      msg: 'MSM Merge',
    });
    if (!result?.ok) return { error: result?.error || 'Merge failed' };

    const editUrl = `${window.location.origin}/edit#/${org}/${satellite}${pagePath}`;
    return { ok: true, editUrl };
  } catch (e) {
    return { error: e.message || 'Merge failed' };
  }
}
