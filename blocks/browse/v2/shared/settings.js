// Browser-local UI preferences, not document or site configuration.
const STORAGE_KEY = 'da-browse-settings';

export function getBrowseSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const settings = JSON.parse(raw);
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new TypeError('Browse settings must be an object.');
      }
      return settings;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not read browse settings.', error);
    return {};
  }

  return {};
}

export function updateBrowseSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getBrowseSettings(), ...settings }));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not save browse settings.', error);
  }
}
