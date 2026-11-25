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

function getEntryPath(entry) {
  return typeof entry === 'string' ? entry : entry?.path;
}

export function getRecentFiles(sitePath) {
  const recent = readAll()[sitePath];
  return Array.isArray(recent) ? recent.map(getEntryPath).filter((path) => typeof path === 'string') : [];
}

export function addRecentFile(path) {
  if (typeof path !== 'string') return;
  const parts = path.split('/');
  if (parts.length < 4 || parts[0] !== '' || parts.slice(1).includes('')) return;
  const sitePath = parts.slice(0, 3).join('/');
  const all = readAll();
  const recent = Array.isArray(all[sitePath]) ? all[sitePath] : [];
  all[sitePath] = [{ path, timestamp: Date.now() }, ...recent.filter((entry) => {
    const recentPath = getEntryPath(entry);
    return typeof recentPath === 'string' && recentPath !== path;
  })]
    .slice(0, MAX_FILES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage may be unavailable (Safari private mode, quota, etc.)
  }
}
