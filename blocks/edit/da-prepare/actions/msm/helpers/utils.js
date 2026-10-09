import { getNx, getNx2Api } from '../../../../../../scripts/utils.js';
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
  const { source } = await getNx2Api();
  const result = await call(() => source.copy({
    org,
    site: base,
    path: `${pagePath}.html`,
    destination: `/${org}/${satellite}${pagePath}.html`,
  }), 'Failed to create override');
  return result.error ? result : { ok: true };
}

export async function getSatellitePageStatus(org, satellite, pagePath) {
  const { status } = await getNx2Api();
  const path = pagePath.replace('.html', '');
  const result = await call(() => status.get({ org, site: satellite, path }), 'Status failed');
  if (result.error) return { preview: false, live: false };
  const json = await result.resp.json();
  return {
    preview: json.preview?.status === 200,
    live: json.live?.status === 200,
  };
}

export async function deleteOverride(org, satellite, pagePath) {
  const { source } = await getNx2Api();
  const result = await call(
    () => source.delete({ org, site: satellite, path: `${pagePath}.html` }),
    'Failed to delete override',
  );
  return result.error ? result : { ok: true };
}

let mergeCopyFn;
export function setMergeCopy(fn) { mergeCopyFn = fn; }

export async function mergeFromBase(org, base, satellite, pagePath) {
  try {
    const { isHlx6 } = await getNx2Api();
    const [baseHlx6, satelliteHlx6] = await Promise.all([
      isHlx6(org, base),
      isHlx6(org, satellite),
    ]);
    if (baseHlx6 || satelliteHlx6) {
      return { error: 'Merge isn\'t available for Helix 6 sites yet, use Override' };
    }

    const mergeCopy = mergeCopyFn
      || (await import(`${getNx()}/blocks/loc/project/index.js`)).mergeCopy;

    const url = {
      source: `/${org}/${base}${pagePath}.html`,
      destination: `/${org}/${satellite}${pagePath}.html`,
    };

    const result = await mergeCopy(url, 'MSM Merge');
    if (!result?.ok) return { error: 'Merge failed' };

    const editUrl = `${window.location.origin}/edit#/${org}/${satellite}${pagePath}`;
    return { ok: true, editUrl };
  } catch (e) {
    return { error: e.message || 'Merge failed' };
  }
}
