const STORAGE_KEY = 'da-favorites';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    if (!data || Object.keys(data).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be unavailable (Safari private mode, quota, etc.)
  }
}

export function getSiteFavorites(sitePath) {
  if (!sitePath) return [];
  const paths = Object.entries(readAll())
    .filter(([folder]) => folder === sitePath || folder.startsWith(`${sitePath}/`))
    .flatMap(([, items]) => (Array.isArray(items) ? items : []))
    .filter((path) => typeof path === 'string' && path.startsWith(`${sitePath}/`));
  return [...new Set(paths)];
}

export function getFavorites(folderPath) {
  if (!folderPath) return [];
  const sitePath = folderPath.split('/').slice(0, 3).join('/');
  return getSiteFavorites(sitePath)
    .filter((path) => path.slice(0, path.lastIndexOf('/')) === folderPath);
}

export function isFavorite(folderPath, itemPath) {
  if (!folderPath || !itemPath) return false;
  return getFavorites(folderPath).includes(itemPath);
}

export function toggleFavorite(folderPath, itemPath, { starred } = {}) {
  if (!folderPath || !itemPath) return false;
  const all = readAll();
  const list = Array.isArray(all[folderPath]) ? all[folderPath] : [];
  const nowFavorite = starred ?? !isFavorite(folderPath, itemPath);
  Object.entries(all).forEach(([folder, paths]) => {
    if (!Array.isArray(paths) || !paths.includes(itemPath)) return;
    const remaining = paths.filter((path) => path !== itemPath);
    if (remaining.length) all[folder] = remaining;
    else delete all[folder];
  });
  if (nowFavorite) all[folderPath] = [...list.filter((path) => path !== itemPath), itemPath];
  writeAll(all);
  return nowFavorite;
}
