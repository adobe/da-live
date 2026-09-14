import { getNx, getNx2Api, sanitizePathParts } from '../../scripts/utils.js';
import { DA_ORIGIN } from '../shared/constants.js';

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

// Reads a DA resource from a full DA_ORIGIN URL, dispatching to the right
// api.js namespace based on the URL's api segment (/config vs /source).
async function getResource(fullUrl) {
  const { config, source } = await getNx2Api();
  const { pathname } = new URL(fullUrl);
  const [api, org, site, ...parts] = pathname.slice(1).split('/');
  const getFn = api === 'config' ? config.get : source.get;
  return getFn({ org, site, path: `/${parts.join('/')}` });
}

async function getText(sourcePath, org, site, path) {
  const getResp = await getResource(path);
  if (!getResp.ok) return null;
  const text = await getResp.text();
  return text.replaceAll(sourcePath, `/${org}/${site}`);
}

async function getBlob(path) {
  const getResp = await getResource(path);
  if (!getResp.ok) return null;
  return getResp.blob();
}

async function bulkAemAdmin(org, site, files) {
  const paths = files.map((file) => {
    const [, , ...parts] = sanitizePathParts(file.path);
    return `/${parts.join('/')}`.replace('.html', '');
  });

  const { aem } = await getNx2Api();
  const resp = await aem.preview({ org, site, path: paths, forceUpdate: true });
  if (!resp.ok) return { type: 'error', message: 'Error previewing', status: resp.status };

  return { type: 'success', message: 'Success previewing.', status: resp.status };
}

export async function copyConfig(sourcePath, org, site) {
  const destText = await getText(sourcePath, org, site, `${DA_ORIGIN}/config${sourcePath}/`);
  if (!destText) return { ok: false };

  const { config } = await getNx2Api();
  return config.save({ org, site, body: destText });
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

    const { source } = await getNx2Api();
    const putResp = await source.save(savePath, { body: blob });
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
