import { getNx2Api } from '../../../scripts/utils.js';
import { formatDate } from '../../shared/utils.js';

function toEnv(env) {
  return {
    status: env.status,
    url: env.url,
    lastModified: env.lastModified ? formatDate(env.lastModified) : null,
  };
}

// Preview and live status of an item from AEM, or a 401 pair when it is not readable.
export async function fetchAemStatus({ path, ext }) {
  const { status, asJson } = await getNx2Api();
  // AEM resolves HTML pages by their extensionless path.
  const aemPath = ext === 'html' ? path.slice(0, -5) : path;
  const { data: json } = await asJson(status.get(aemPath));
  if (!json) return { preview: { status: 401 }, live: { status: 401 } };

  const redirect = json.live.redirectLocation;
  return {
    preview: { ...toEnv(json.preview), redirect },
    live: { ...toEnv(json.live), redirect },
  };
}

// Version count and last modifier of an item from DA, or undefined when unavailable.
export async function fetchDaStatus({ path }) {
  const { versions, source, isHlx6 } = await getNx2Api();
  const [, org, site] = path.split('/');

  const resp = await versions.list(path);
  if (!resp.ok) return undefined;
  const json = await resp.json();

  // hlx6 no longer keeps last-modified info in the version records, and its
  // version entries are ULID-based rather than /versionsource urls. Count the
  // version records and HEAD the document for the last-modified-by header.
  if (await isHlx6(org, site)) {
    const headResp = await source.getMetadata(path);
    const lastModifiedBy = headResp?.headers?.get('x-last-modified-by');
    return {
      version: json.filter((entry) => entry.version).length,
      lastModifiedBy: lastModifiedBy ? lastModifiedBy.split('@')[0].toLowerCase() : 'anonymous',
    };
  }

  if (json.length === 0) return { version: 0, lastModifiedBy: 'anonymous' };

  return {
    version: json.filter((entry) => entry.url?.startsWith('/versionsource')).length,
    lastModifiedBy: json
      .reduce((a, b) => (b.timestamp > a.timestamp ? b : a))
      .users.map((user) => user.email.split('@')[0]).join(', ').toLowerCase(),
  };
}

export async function doesFileExist(path) {
  const { source } = await getNx2Api();
  const { status } = await source.getMetadata(path);
  return status === 200;
}

export function getRenamedPath({ path, name, newName }) {
  const idx = path.lastIndexOf(name);
  return `${path.slice(0, idx)}${newName}${path.slice(idx + name.length)}`;
}
