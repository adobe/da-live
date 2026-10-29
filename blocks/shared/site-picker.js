import { getNx2Api } from '../../scripts/utils.js';
import { getSiteOptions } from './site-picker-utils.js';
import { checkSiteChoices, getCreateSiteHref, setRecentSite } from './site-access.js';

export function connectSiteSelector({ selector, signal }) {
  if (signal.aborted || !selector.isConnected) return undefined;
  let request;
  let choicesKey;
  let scope;
  let dialog;
  let opening = false;
  let inaccessibleSites;

  const closeDialog = () => {
    dialog?.remove();
    dialog = undefined;
  };

  const refresh = async () => {
    if (signal.aborted) return;
    const current = window.location.hash.replace(/^#\//, '').split('/').slice(0, 2).join('/');
    const value = getSiteOptions({ current })[0]?.value ?? '';
    let recentSites = [];
    let error;
    try {
      recentSites = JSON.parse(localStorage.getItem('da-sites') || '[]');
      if (!Array.isArray(recentSites)) throw new TypeError('Recent sites must be a list.');
    } catch (cause) {
      recentSites = [];
      error = `Could not read recent sites: ${cause.message}`;
    }
    if (value && !error) {
      try {
        const [org, site] = value.split('/');
        setRecentSite({ org, site });
        recentSites = JSON.parse(localStorage.getItem('da-sites'));
      } catch (cause) {
        error = `Could not save the current site in this browser: ${cause.message}`;
      }
    }
    const sites = getSiteOptions({ recentSites, current: value });
    const key = JSON.stringify({ sites, value, error });
    if (key === choicesKey) return;
    choicesKey = key;
    request?.abort();
    if (scope !== value) closeDialog();
    scope = value;
    selector.sites = sites;
    selector.value = value;
    selector.error = error;
    if (document.querySelector('.landing') || new URLSearchParams(window.location.search).has('landing')) {
      selector.heading = 'Your recent sites';
    }
    if (!sites.length) return;
    request = new AbortController();
    const checking = request;
    try {
      const { source } = await getNx2Api();
      const result = await checkSiteChoices({
        sites,
        source,
        signal: checking.signal,
        inaccessibleSites,
      });
      if (checking.signal.aborted || signal.aborted) return;
      inaccessibleSites = result.inaccessibleSites;
      selector.error = [error, result.error].filter(Boolean).join(' ') || undefined;
    } catch (cause) {
      if (!checking.signal.aborted && !signal.aborted) {
        selector.error = [error, `Could not check your sites: ${cause.message}`].filter(Boolean).join(' ');
      }
    }
  };

  const showAddSite = async () => {
    if (opening || dialog) return;
    opening = true;
    const current = scope;
    try {
      await import('./add-site.js');
      if (signal.aborted || current !== scope) return;
      dialog = document.createElement('da-add-site');
      [dialog.org] = scope.split('/');
      dialog.createHref = getCreateSiteHref({ org: dialog.org });
      dialog.addEventListener('close', () => {
        closeDialog();
        selector.focus();
      });
      dialog.addEventListener('site-added', ({ detail: { value } }) => {
        closeDialog();
        window.location.hash = `/${value}`;
        refresh();
        selector.focus();
      });
      document.body.append(dialog);
    } catch (error) {
      if (!signal.aborted && current === scope) selector.error = `Could not open Add site: ${error.message}`;
    } finally {
      opening = false;
    }
  };

  selector.addEventListener('site-select', ({ detail: { value } }) => {
    if (!selector.sites.some((site) => site.value === value)) {
      selector.error = 'This site is no longer available. Reload the page and try again.';
      return;
    }
    window.location.hash = `/${value}`;
    refresh();
  }, { signal });
  selector.addEventListener('site-retry', () => {
    choicesKey = undefined;
    refresh();
  }, { signal });
  document.addEventListener('site-add', showAddSite, { signal });
  window.addEventListener('hashchange', refresh, { signal });
  window.addEventListener('storage', ({ key }) => {
    if (key === 'da-sites' || key === null) refresh();
  }, { signal });
  signal.addEventListener('abort', () => {
    request?.abort();
    closeDialog();
  }, { once: true });

  return { ready: refresh(), refresh };
}
