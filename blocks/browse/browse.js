import { getNx } from '../../scripts/utils.js';
import { fetchDaConfigs } from '../shared/utils.js';
import { getBrowseComponent, resolveBrowsePath } from './utils.js';
import getPathDetails from '../shared/pathDetails.js';
import { branchContext, validateBranch } from '../shared/branch-selector/context.js';
import { installBranchHashGuard } from '../shared/branch-selector/navigation.js';
import { installDaRsNavigation } from '../shared/da-rs-navigation.js';
import { isDaRsDemoActive } from '../shared/da-rs-bootstrap.js';
import { isDaRsBinding } from '../shared/da-rs-provider.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);

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

async function loadLandingSurface(el) {
  const background = await loadStyle(new URL('../landing/landing.css', import.meta.url).href);
  if (!document.adoptedStyleSheets.includes(background)) {
    document.adoptedStyleSheets.push(background);
  }
  const surface = document.createElement('div');
  surface.className = 'landing';
  el.replaceChildren(surface);
}

async function loadBrowseStyles() {
  const styles = await loadStyle(import.meta.url);
  if (!document.adoptedStyleSheets.includes(styles)) document.adoptedStyleSheets.push(styles);
}

async function loadComponent(el, cmpName, pathDetails, surface, isCurrent) {
  await surface;
  if (!isCurrent()) return;
  if (cmpName === 'da-landing') {
    const { default: loadLanding } = await import('../landing/landing.js');
    if (isCurrent()) loadLanding(el);
    return;
  }

  const existing = el.querySelector(cmpName);
  if (existing && pathDetails) {
    existing.details = pathDetails;
    return;
  }
  // Swapping views — remove whichever component is currently mounted.
  el.querySelector('da-sites, da-browse, .landing')?.remove();
  const componentPath = cmpName === 'da-sites' ? '.' : await resolveBrowsePath({
    search: window.location.search,
    org: pathDetails.org,
    site: pathDetails.site,
    fetchConfigs: fetchDaConfigs,
  });
  if (!isCurrent()) return;
  if (componentPath === './v2') useV2Nav();
  if (cmpName === 'da-sites') await import('./da-sites/da-sites.js');
  else if (componentPath === './v2') await import('./v2/da-browse/da-browse.js');
  else await import('./legacy/da-browse/da-browse.js');
  if (!isCurrent()) return;
  const cmp = document.createElement(cmpName);
  cmp.details = pathDetails;
  el.append(cmp);
}

function setRecentSite(details) {
  if (!details.site) return;
  // Demo sites are backend-discovered, never hosted recents.
  if (isDaRsDemoActive()) return;
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
  installDaRsNavigation();
  installBranchHashGuard();
  let generation = 0;
  hashChange.subscribe(async (nxDetails) => {
    generation += 1;
    const current = generation;
    const { href } = window.location;
    const isCurrent = () => current === generation && window.location.href === href;
    let pathDetails = nxDetails;
    let context;
    try {
      const bound = isDaRsBinding();
      if (bound) pathDetails = getPathDetails();
      context = branchContext();
      if (context) {
        if (!bound) pathDetails = getPathDetails();
        await validateBranch(context);
      }
    } catch (error) {
      if (!isCurrent()) return;
      el.replaceChildren();
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = `Unable to open ${context ? 'branch' : 'location'}: ${error.message}`;
      el.append(message);
      return;
    }
    if (!isCurrent()) return;
    const cmpName = getBrowseComponent({ search: window.location.search, pathDetails });
    const surface = cmpName === 'da-landing' ? loadLandingSurface(el) : loadBrowseStyles();
    loadComponent(el, cmpName, pathDetails, surface, isCurrent);
    if (pathDetails) setRecentSite(pathDetails);
  });

  // Lazily preload the editor
  setTimeout(() => { import('da-y-wrapper'); }, 3000);
}
