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
  const list = Array.isArray(all[folderPath]) ? all[folderPath] : [];
  const idx = list.indexOf(itemPath);
  let nowFavorite;
  if (idx === -1) {
    list.push(itemPath);
    nowFavorite = true;
  } else {
    list.splice(idx, 1);
    nowFavorite = false;
  }
  if (list.length === 0) {
    delete all[folderPath];
  } else {
    all[folderPath] = list;
  }
  writeAll(all);
  return nowFavorite;
}
