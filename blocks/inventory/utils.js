
export function parseRepoPath(fullpath) {
  const trimmed = (fullpath || '').trim();
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const parts = normalized.slice(1).split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [org, site, ...rest] = parts;
  const pathSegments = [org, site, ...rest];
  return {
    org,
    site,
    pathSegments,
    fullpath: `/${pathSegments.join('/')}`,
    contentPath: rest.join('/'),
  };
}

export function contextToPathContext(context) {
  if (!context) return null;
  const { org, site, path } = context;
  if (!org || !site) return null;
  const base = `/${org}/${site}`;
  const fullpath = path ? `${base}/${path.split('/').filter(Boolean).join('/')}` : base;
  const parsed = parseRepoPath(fullpath);
  return parsed ? { pathSegments: parsed.pathSegments, fullpath: parsed.fullpath } : null;
}

export function itemRowPathKey(folderPathKey, item) {
  const name = item.name || '';
  return folderPathKey ? `${folderPathKey}/${name}` : name;
}

/** Whether the list API row is a folder (no non-empty `ext`); files include `ext`. */
export function isFolder(row) {
  return row?.ext == null || String(row.ext).trim() === '';
}

/** Resource kind from extension (icons, list behavior). */
export const RESOURCE_TYPE = Object.freeze({
  folder: 'folder',
  document: 'document',
  media: 'media',
  sheet: 'sheet',
  file: 'file',
});

export const ICON_URLS = {
  folder: '/img/icons/s2-icon-folder-20-n.svg',
  fileText: '/img/icons/s2-icon-filetext-20-n.svg',
  image: '/img/icons/s2-icon-image-20-n.svg',
  table: '/img/icons/s2-icon-table-20-n.svg',
};

export function entryTypeFromExtension(ext) {
  if (ext == null || ext === '') {
    return RESOURCE_TYPE.folder;
  }
  const e = String(ext).replace(/^\./, '').toLowerCase();
  if (['html', 'htm'].includes(e)) {
    return RESOURCE_TYPE.document;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov'].includes(e)) {
    return RESOURCE_TYPE.media;
  }
  if (['json', 'xlsx', 'xls', 'csv'].includes(e)) {
    return RESOURCE_TYPE.sheet;
  }
  return RESOURCE_TYPE.file;
}

export function getIconByExtension(ext) {
  switch (entryTypeFromExtension(ext)) {
    case RESOURCE_TYPE.folder:
      return 'folder';
    case RESOURCE_TYPE.document:
      return 'fileText';
    case RESOURCE_TYPE.media:
      return 'image';
    case RESOURCE_TYPE.sheet:
      return 'table';
    case RESOURCE_TYPE.file:
    default:
      return 'fileText';
  }
}

