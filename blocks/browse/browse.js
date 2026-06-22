import { getNx } from '../../scripts/utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);

const styles = await loadStyle(import.meta.url);
document.adoptedStyleSheets.push(styles);

async function loadComponent(el, cmpName, pathDetails) {
  const existing = el.querySelector(cmpName);
  if (existing && pathDetails) {
    existing.details = pathDetails;
    return;
  }
  // Swapping views — remove whichever component is currently mounted.
  el.querySelector('da-sites, da-browse')?.remove();
  await import(`./${cmpName}/${cmpName}.js`);
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
