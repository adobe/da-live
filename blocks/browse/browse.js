import getPathDetails from '../shared/pathDetails.js';

// Preload Lit
import('../../deps/lit/dist/index.js');

async function loadComponent(el, cmpName, details) {
  el.innerHTML = '';
  await import(`./${cmpName}/${cmpName}.js`);
  const cmp = document.createElement(cmpName);
  if (details) cmp.details = details;
  el.append(cmp);
}

function setRecentSite(details) {
  if (!details.repo) return;
  if (details.repo.startsWith('.')) return;
  const currentSites = JSON.parse(localStorage.getItem('da-sites')) || [];
  const siteString = `${details.owner}/${details.repo}`;
  const foundIdx = currentSites.indexOf(siteString);
  if (foundIdx === 0) return;
  if (foundIdx !== -1) currentSites.splice(foundIdx, 1);
  localStorage.setItem('da-sites', JSON.stringify([siteString, ...currentSites].slice(0, 8)));
}

async function setupExperience(el, e) {
  const details = getPathDetails();
  if (details) setRecentSite(details);
  if (e) {
    const oldHash = new URL(e.oldURL).hash;
    const newHash = new URL(e.newURL).hash;

    // Are they already browsing
    if (oldHash.startsWith('#/') && newHash.startsWith('#/')) {
      document.querySelector('da-browse').details = details;
      return;
    }
  }
  if (!details) {
    await loadComponent(el, 'da-sites');
  } else {
    await loadComponent(el, 'da-browse', details);
  }
}

export default async function init(el) {
  await setupExperience(el);

  // Lazily rreload the editor
  setTimeout(() => { import('da-y-wrapper'); }, 3000);

  window.addEventListener('hashchange', async (e) => {
    await setupExperience(el, e);
  });
}
