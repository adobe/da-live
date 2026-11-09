const STORAGE_KEY = 'da-recent-files';
const MAX_FILES = 18;

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getRecentFiles(sitePath) {
  const paths = readAll()[sitePath];
  return Array.isArray(paths) ? paths.filter((path) => typeof path === 'string') : [];
}

export function addRecentFile(path) {
  const parts = path?.split('/') ?? [];
  if (parts.length < 4 || parts[0] !== '') return;
  const sitePath = parts.slice(0, 3).join('/');
  const all = readAll();
  all[sitePath] = [path, ...getRecentFiles(sitePath).filter((recent) => recent !== path)]
    .slice(0, MAX_FILES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage may be unavailable (Safari private mode, quota, etc.)
  }
}
