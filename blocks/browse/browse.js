import { getNx } from '../../scripts/utils.js';
import { fetchDaConfigs } from '../shared/utils.js';
import { getBrowseComponent, resolveBrowsePath } from './utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);

const V2_NAV_PATH = '/nx/fragments/browse2-nav';

function takeGreeting(el) {
  const section = el.closest('.section')?.nextElementSibling;
  const greeting = section?.querySelector('div.greeting');
  if (!greeting) return undefined;
  // NX snapshots these queues before Browse initializes.
  section.blocks = [];
  section.autoBlocks = [];
  section.linkBlocks = [];
  section.replaceChildren();
  section.remove();
  return greeting;
}

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

async function loadLandingStyles() {
  const background = await loadStyle(new URL('../landing/landing.css', import.meta.url).href);
  if (!document.adoptedStyleSheets.includes(background)) {
    document.adoptedStyleSheets.push(background);
  }
}

async function loadLandingSurface(el) {
  await loadLandingStyles();
  const surface = document.createElement('div');
  surface.className = 'landing';
  el.replaceChildren(surface);
}

async function loadBrowseStyles(cmpName) {
  const styles = await loadStyle(import.meta.url);
  if (!document.adoptedStyleSheets.includes(styles)) document.adoptedStyleSheets.push(styles);
  if (cmpName === 'da-sites') await loadLandingStyles();
}

async function loadComponent(el, cmpName, pathDetails, surface, greeting) {
  await surface;
  if (cmpName === 'da-landing') {
    const { default: loadLanding } = await import('../landing/landing.js');
    loadLanding(el);
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
  if (componentPath === './v2') useV2Nav();
  if (cmpName === 'da-sites') await import('./da-sites/da-sites.js');
  else if (componentPath === './v2') await import('./v2/da-browse/da-browse.js');
  else await import('./legacy/da-browse/da-browse.js');
  const cmp = document.createElement(cmpName);
  cmp.details = pathDetails;
  if (cmpName === 'da-sites') cmp.greeting = greeting;
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
  el.querySelectorAll('picture').forEach((picture) => picture.remove());
  const greeting = getBrowseComponent({ search: window.location.search }) === 'da-sites'
    ? takeGreeting(el) : undefined;
  hashChange.subscribe((pathDetails) => {
    const cmpName = getBrowseComponent({ search: window.location.search, pathDetails });
    const surface = cmpName === 'da-landing' ? loadLandingSurface(el) : loadBrowseStyles(cmpName);
    loadComponent(el, cmpName, pathDetails, surface, greeting);
    if (pathDetails) setRecentSite(pathDetails);
  });

  // Lazily preload the editor
  setTimeout(() => { import('da-y-wrapper'); }, 3000);
}
