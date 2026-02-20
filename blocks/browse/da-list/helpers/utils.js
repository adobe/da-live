import { SUPPORTED_FILES, DA_ORIGIN } from '../../../shared/constants.js';
import { sanitizePath, sanitizePathParts } from '../../../../scripts/utils.js';
import { daFetch } from '../../../shared/utils.js';

const MAX_DEPTH = 1000;

function traverseFolder(entry) {
  const reader = entry.createReader();
  // Resolved when the entire directory is traversed
  return new Promise((resolveDirectory) => {
    const iterationAttempts = [];
    const errorHandler = () => {};
    function readEntries() {
      // According to the FileSystem API spec, readEntries() must be called until
      // it calls the callback with an empty array.
      reader.readEntries((batchEntries) => {
        if (!batchEntries.length) {
          // Done iterating this folder
          resolveDirectory(Promise.all(iterationAttempts));
        } else {
          // Add a list of promises for each directory entry. If the entry is itself
          // a directory, then that promise won't resolve until it is fully traversed.
          iterationAttempts.push(Promise.all(batchEntries.map((batchEntry) => {
            if (batchEntry.isDirectory) {
              return traverseFolder(batchEntry);
            }
            return Promise.resolve(batchEntry);
          })));
          // Try calling readEntries() again for the same dir, according to spec
          readEntries();
        }
      }, errorHandler);
    }
    // Initial call to recursive entry reader function
    readEntries();
  });
}

function packageFile(file, entry) {
  const { name } = file;
  let { type } = file;

  // No content type fallback
  const ext = (file.name || '').split('.').pop();
  if (!type) type = SUPPORTED_FILES[ext];

  // Check if supported type
  const isSupported = Object.keys(SUPPORTED_FILES)
    .some((key) => type === SUPPORTED_FILES[key]);
  if (!isSupported) return null;

  // Sanitize path
  const path = entry.fullPath.replaceAll(' ', '-').toLowerCase();
  return { data: file, name, type, ext, path };
}

function getFile(entry) {
  return new Promise((resolve) => {
    const callback = (file) => { resolve(packageFile(file, entry)); };
    entry.file(callback);
  });
}

export async function getFullEntryList(entries) {
  const folderEntries = [];
  const fileEntries = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      folderEntries.push(entry);
    } else {
      fileEntries.push(entry);
    }
  }

  for (const entry of folderEntries) {
    const traversed = await traverseFolder(entry);
    fileEntries.push(...traversed.flat(MAX_DEPTH));
  }

  const files = await Promise.all(fileEntries.map((entry) => getFile(entry)));
  return files.filter((file) => file);
}

export function getDropConflicts(list, files) {
  const existing = new Set(
    list.map((item) => (item.ext ? `${item.name}.${item.ext}` : item.name)),
  );
  const matched = new Set();
  return files.reduce((conflicts, file) => {
    const sanitizedPath = sanitizePath(file.path);
    const [displayName] = sanitizedPath.split('/').slice(1);
    if (!matched.has(displayName) && existing.has(displayName)) {
      matched.add(displayName);
      conflicts.push(displayName);
    }
    return conflicts;
  }, []);
}

export async function handleUpload(list, fullpath, file) {
  const { data, path } = file;
  const formData = new FormData();
  formData.append('data', data);
  const opts = { method: 'POST', body: formData };
  const sanitizedPath = sanitizePath(path);
  const postpath = `${fullpath}${sanitizedPath}`;

  try {
    await daFetch(`${DA_ORIGIN}/source${postpath}`, opts);
    file.imported = true;

    const [displayName] = sanitizedPath.split('/').slice(1);
    const [filename, ...rest] = displayName.split('.');
    const ext = rest.pop();
    const rejoined = [filename, ...rest].join('.');

    const existingItem = list.find((item) => {
      const itemDisplay = item.ext ? `${item.name}.${item.ext}` : item.name;
      return itemDisplay === displayName;
    });

    if (existingItem) {
      existingItem.lastModified = Date.now();
      return null;
    }

    const item = { name: rejoined, path: `${fullpath}/${displayName}`, lastModified: Date.now() };
    if (ext) item.ext = ext;

    return item;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e);
  }
  return null;
}

export function items2Clipboard(items) {
  const aemUrls = items.reduce((acc, item) => {
    if (item.ext) {
      const [org, repo, ...pathParts] = sanitizePathParts(item.path.replace('.html', ''));
      const pageName = pathParts.pop();
      pathParts.push(pageName === 'index' ? '' : pageName);

      const url = `https://main--${repo}--${org}.aem.page/${pathParts.join('/')}`;
      const toPush = item.message ? `${url} - ${item.message}` : url;

      acc.push(toPush);
    }
    return acc;
  }, []);
  const blob = new Blob([aemUrls.join('\n')], { type: 'text/plain' });
  const data = [new ClipboardItem({ [blob.type]: blob })];
  navigator.clipboard.write(data);
}
