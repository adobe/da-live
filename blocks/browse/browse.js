import { getNx, getNx2 } from '../../scripts/utils.js';
import { resolveBrowsePath } from './utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);

const styles = await loadStyle(import.meta.url);
document.adoptedStyleSheets.push(styles);

async function getBrowsePath({ org, site }) {
  const { search } = window.location;
  try {
    const { fetchDaConfigs } = await import(`${getNx2()}/utils/daConfig.js`);
    return await resolveBrowsePath({ search, org, site, fetchConfigs: fetchDaConfigs });
  } catch {
    return resolveBrowsePath({ search, org, site, fetchConfigs: () => [] });
  }
}

const V2_NAV_PATH = '/nx/fragments/browse2-nav';

// to be removed when the v2 nav is fully integrated
function useV2Nav() {
  if (document.head.querySelector('meta[name="nav-path"]')) return;
  const meta = document.createElement('meta');
  meta.name = 'nav-path';
  meta.content = V2_NAV_PATH;
  document.head.append(meta);
  const nav = document.querySelector('header nx-nav');
  if (typeof nav?.loadNav === 'function') nav.loadNav();
}

async function loadComponent(el, cmpName, pathDetails) {
  const existing = el.querySelector(cmpName);
  if (existing && pathDetails) {
    existing.details = pathDetails;
    return;
  }
  // Swapping views — remove whichever component is currently mounted.
  el.querySelector('da-sites, da-browse')?.remove();
  const componentPath = cmpName === 'da-sites' ? '.' : await getBrowsePath(pathDetails);
  if (componentPath === './v2') useV2Nav();
  await import(`${componentPath}/${cmpName}/${cmpName}.js`);
  const cmp = document.createElement(cmpName);
  cmp.details = pathDetails;
  el.append(cmp);
}

function setRecentSite(details) {
  if (!details.site) return;
  // .trash, .da, .helix, .versions
  if (details.site.startsWith('.')) return;
  const currentSites = JSON.parse(localStorage.getItem('da-sites')) || [];
  const siteString = `${details.org}/${details.site}`;
  const foundIdx = currentSites.indexOf(siteString);
  if (foundIdx === 0) return;
  if (foundIdx !== -1) currentSites.splice(foundIdx, 1);
  localStorage.setItem('da-sites', JSON.stringify([siteString, ...currentSites].slice(0, 8)));
}

export default function init(el) {
  hashChange.subscribe((pathDetails) => {
    const cmpName = pathDetails ? 'da-browse' : 'da-sites';
    loadComponent(el, cmpName, pathDetails);
    if (pathDetails) setRecentSite(pathDetails);
  });

  // Lazily preload the editor
  setTimeout(() => { import('da-y-wrapper'); }, 3000);
}
