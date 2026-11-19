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
  const all = readAll();
  const list = all[folderPath];
  return Array.isArray(list) ? list : [];
}

export function isFavorite(folderPath, itemPath) {
  if (!folderPath || !itemPath) return false;
  return getFavorites(folderPath).includes(itemPath);
}

export function toggleFavorite(folderPath, itemPath) {
  if (!folderPath || !itemPath) return false;
  const all = readAll();
  const nowFavorite = !Object.values(all)
    .some((items) => Array.isArray(items) && items.includes(itemPath));
  if (nowFavorite) {
    const list = Array.isArray(all[folderPath]) ? all[folderPath] : [];
    all[folderPath] = [...list, itemPath];
  } else {
    Object.entries(all).forEach(([folder, items]) => {
      if (!Array.isArray(items) || !items.includes(itemPath)) return;
      const kept = items.filter((path) => path !== itemPath);
      if (kept.length) all[folder] = kept;
      else delete all[folder];
    });
  }
  writeAll(all);
  return nowFavorite;
}
