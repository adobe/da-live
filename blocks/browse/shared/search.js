import { getNx2Api } from '../../../scripts/utils.js';

const DEFAULT_LOCALES = ['langstore'];

export function getLocales(translate) {
  const locales = new Set(DEFAULT_LOCALES);

  translate?.languages?.data?.forEach((lang) => {
    lang.locales?.split(',').forEach((loc) => {
      const dir = loc.split('/').find((part) => part?.trim() !== '');
      if (dir) {
        locales.add(dir.trim());
      }
    });
  });

  return locales;
}

export async function getSearchScope({ startPath, getBrowseItems }) {
  const isSiteFolder = startPath.split('/').length === 3;
  if (!isSiteFolder) {
    return { paths: [startPath], files: [] };
  }

  const { source } = await getNx2Api();
  const resp = await source.get(`${startPath}/.da/translate.json`);
  if (!resp.ok) {
    return { paths: [startPath], files: [] };
  }

  const translate = await resp.json();
  const locales = getLocales(translate);
  const browseItems = getBrowseItems();

  if (!locales.size || !browseItems?.length) {
    return { paths: [startPath], files: [] };
  }

  const paths = [];
  const files = [];

  browseItems.forEach((item) => {
    if (!locales.has(item.name)) {
      if (item.ext) {
        files.push(item);
      } else {
        paths.push(item.path);
      }
    }
  });

  return { paths, files };
}

export function timeoutWrapper({ fn, timeout = 30000 }) {
  return new Promise((resolve) => {
    const loading = fn();

    const timedout = setTimeout(() => { resolve({ error: 'timeout' }); }, timeout);

    loading.then((result) => {
      clearTimeout(timedout);
      resolve(result);
    }).catch(() => {
      clearTimeout(timedout);
      resolve({ error: 'bad result' });
    });
  });
}

export const SEARCH_TYPES = ['.html', '.json', '.svg'];

export function isSearchable(path) {
  return SEARCH_TYPES.some((type) => path.endsWith(type));
}

export function getResultName(file, fullpath) {
  return file.path.replace(`.${file.ext}`, '').replace(fullpath, '');
}

// Runs fn under a timeout and retries while shouldRetry(result) holds.
export async function withRetry({
  fn,
  path,
  timeout = 30000,
  retries = 3,
  shouldRetry = (result) => result?.error,
  isCancelled,
}) {
  let result = await timeoutWrapper({ fn, timeout });
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (!shouldRetry(result) || isCancelled?.()) break;
    // eslint-disable-next-line no-console
    console.log(`retrying due to ${result.error}: ${path}`);
    // eslint-disable-next-line no-await-in-loop
    result = await timeoutWrapper({ fn, timeout });
  }
  return result;
}
