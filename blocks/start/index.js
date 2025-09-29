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

    // Get the destination text
    const destText = await getText(sourcePath, org, site, `${DA_ORIGIN}/source${path}`);
    if (!destText) {
      file.ok = false;
      return;
    }

    // Save the file
    const savePath = path.replace(sourcePath, `/${org}/${site}`);

    const body = new FormData();

    const type = MIME_TYPES[ext];
    const blob = new Blob([destText], { type });
    body.append('data', blob);
    const opts = { method: 'POST', body };
    const putResp = await daFetch(`${DA_ORIGIN}/source${savePath}`, opts);
    file.ok = putResp.ok;
  };

  const conf = { path: sourcePath, callback, throttle: 50 };
  const { results } = crawl(conf);
  return results;
}
