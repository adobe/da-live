import { getNx, sanitizePathParts } from '../../scripts/utils.js';
import { daFetch } from '../shared/utils.js';
import { daApi } from '../shared/da-api.js';

const { crawl } = await import(`${getNx()}/public/utils/tree.js`);

const SEND_EXT_TO_AEM = [
  'html',
  'json',
  'svg',
  'mp4',
];

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

async function bulkAemAdmin(org, site, files) {
  const paths = files.map((file) => {
    const [, , ...parts] = sanitizePathParts(file.path);
    return `/${parts.join('/')}`.replace('.html', '');
  });

  const body = JSON.stringify({ paths, forceUpdate: true, forceSync: true });
  const opts = { body, method: 'POST', headers: { 'Content-Type': 'application/json' } };

  const aemUrl = `https://admin.hlx.page/preview/${org}/${site}/main/*`;
  const resp = await daFetch(aemUrl, opts);
  if (!resp.ok) return { type: 'error', message: 'Error previewing', status: resp.status };

  return { type: 'success', message: 'Success previewing.', status: resp.status };
}

export async function copyConfig(sourcePath, org, site) {
  const destText = await getText(sourcePath, org, site, daApi.getConfigUrl(`${sourcePath}/`));
  if (!destText) return { ok: false };

  const body = new FormData();
  body.append('config', destText);
  const opts = { method: 'PUT', body };
  return daFetch(daApi.getConfigUrl(`/${org}/${site}/`), opts);
}

export async function copyContent(sourcePath, org, site, setStatus) {
  const callback = async (file) => {
    const { path } = file;
    const ext = path.split('.').pop();

    if (path.includes('/drafts/')) return;

    const shortPath = path.split('/').pop().replace('.html', '');

    setStatus(`Copying ${shortPath}`);

    let blob;
    if (ext === 'json' || ext === 'html' || ext === 'svg') {
      const destText = await getText(sourcePath, org, site, daApi.getSourceUrl(path));
      if (destText) {
        const type = MIME_TYPES[ext];
        blob = new Blob([destText], { type });
      }
    } else {
      const sourceBlob = await getBlob(daApi.getSourceUrl(path));
      if (sourceBlob) blob = sourceBlob;
    }

    if (!blob) {
      file.ok = false;
      return;
    }

    // Save the file
    const savePath = path.replace(sourcePath, `/${org}/${site}`);

    const putResp = await daApi.saveSource(savePath, { blob, method: 'POST' });
    file.ok = putResp.ok;
  };

  const conf = { path: sourcePath, callback, throttle: 50 };
  const { results } = crawl(conf);
  return results;
}

export async function previewContent(org, site, setStatus) {
  setStatus('Bulk previewing content.');

  const callback = async (file) => {
    const { path } = file;
    const ext = path.split('.').pop();
    file.preview = SEND_EXT_TO_AEM.some((aemExt) => aemExt === ext) && !path.includes('docs/library');
  };

  const conf = { path: `/${org}/${site}`, callback, throttle: 150, concurrent: 5 };
  const { results } = crawl(conf);

  const toPreview = (await results).filter((file) => file.preview);
  return bulkAemAdmin(org, site, toPreview);
}
