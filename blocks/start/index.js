import { getNx } from '../../scripts/utils.js';
import { DA_ORIGIN } from '../shared/constants.js';
import { daFetch } from '../shared/utils.js';

const { crawl } = await import(`${getNx()}/public/utils/tree.js`);

const MIME_TYPES = {
  html: 'text/html',
  json: 'application/json',
  svg: 'image/svg+xml',
};

async function getText(sourcePath, org, site, path) {
  const getResp = await daFetch(path);
  if (!getResp.ok) return null;
  const text = await getResp.text();
  return text.replaceAll(sourcePath, `/${org}/${site}`);
}

async function getBlob(path) {
  const getResp = await daFetch(path);
  if (!getResp.ok) return null;
  return getResp.blob();
}

export async function copyConfig(sourcePath, org, site) {
  const destText = await getText(sourcePath, org, site, `${DA_ORIGIN}/config${sourcePath}/`);
  if (!destText) return { ok: false };

  const body = new FormData();
  body.append('config', destText);
  const opts = { method: 'PUT', body };
  return daFetch(`${DA_ORIGIN}/config/${org}/${site}/`, opts);
}

export async function copyContent(sourcePath, org, site) {
  const callback = async (file) => {
    const { path } = file;
    const ext = path.split('.').pop();

    if (path.includes('/drafts/')) return;

    let blob;
    if (ext === 'json' || ext === 'html' || ext === 'svg') {
      const destText = await getText(sourcePath, org, site, `${DA_ORIGIN}/source${path}`);
      if (destText) {
        const type = MIME_TYPES[ext];
        blob = new Blob([destText], { type });
      }
    } else {
      const sourceBlob = await getBlob(`${DA_ORIGIN}/source${path}`);
      if (sourceBlob) blob = sourceBlob;
    }

    if (!blob) {
      file.ok = false;
      return;
    }

    // Save the file
    const savePath = path.replace(sourcePath, `/${org}/${site}`);

    const body = new FormData();

    body.append('data', blob);
    const opts = { method: 'POST', body };
    const putResp = await daFetch(`${DA_ORIGIN}/source${savePath}`, opts);
    file.ok = putResp.ok;
  };

  const conf = { path: sourcePath, callback, throttle: 50 };
  const { results } = crawl(conf);
  return results;
}
