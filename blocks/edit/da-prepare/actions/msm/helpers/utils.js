import { DA_ORIGIN } from '../../../../../shared/constants.js';
import { daFetch } from '../../../../../shared/utils.js';
import { getNx } from '../../../../../../scripts/utils.js';

const AEM_ADMIN = 'https://admin.hlx.page';

export async function previewSatellite(org, satellite, pagePath) {
  const aemPath = pagePath.replace('.html', '');
  const url = `${AEM_ADMIN}/preview/${org}/${satellite}/main${aemPath}`;
  const resp = await daFetch(url, { method: 'POST' });
  if (!resp.ok) {
    const xError = resp.headers?.get('x-error') || `Preview failed (${resp.status})`;
    return { error: xError };
  }
  return resp.json();
}

export async function publishSatellite(org, satellite, pagePath) {
  const aemPath = pagePath.replace('.html', '');
  const url = `${AEM_ADMIN}/live/${org}/${satellite}/main${aemPath}`;
  const resp = await daFetch(url, { method: 'POST' });
  if (!resp.ok) {
    const xError = resp.headers?.get('x-error') || `Publish failed (${resp.status})`;
    return { error: xError };
  }
  return resp.json();
}

export async function createOverride(org, base, satellite, pagePath) {
  const basePath = `${DA_ORIGIN}/source/${org}/${base}${pagePath}.html`;
  const resp = await daFetch(basePath);
  if (!resp.ok) return { error: `Failed to fetch base content (${resp.status})` };

  const html = await resp.text();
  const blob = new Blob([html], { type: 'text/html' });
  const formData = new FormData();
  formData.append('data', blob);

  const satPath = `${DA_ORIGIN}/source/${org}/${satellite}${pagePath}.html`;
  const saveResp = await daFetch(satPath, { method: 'PUT', body: formData });
  if (!saveResp.ok) return { error: `Failed to create override (${saveResp.status})` };
  return { ok: true };
}

export async function getSatellitePageStatus(org, satellite, pagePath) {
  const aemPath = pagePath.replace('.html', '');
  const url = `${AEM_ADMIN}/status/${org}/${satellite}/main${aemPath}`;
  const resp = await daFetch(url);
  if (!resp.ok) return { preview: false, live: false };
  const json = await resp.json();
  return {
    preview: json.preview?.status === 200,
    live: json.live?.status === 200,
  };
}

export async function deleteOverride(org, satellite, pagePath) {
  const satPath = `${DA_ORIGIN}/source/${org}/${satellite}${pagePath}.html`;
  const resp = await daFetch(satPath, { method: 'DELETE' });
  if (!resp.ok) return { error: `Failed to delete override (${resp.status})` };
  return { ok: true };
}

let mergeCopyFn;
export function setMergeCopy(fn) { mergeCopyFn = fn; }

export async function mergeFromBase(org, base, satellite, pagePath) {
  try {
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
