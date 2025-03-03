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

function setRecentOrg(details) {
  const currentOrgs = JSON.parse(localStorage.getItem('da-orgs')) || [];
  const foundIdx = currentOrgs.indexOf(details.owner);
  if (foundIdx === 0) return;
  if (foundIdx !== -1) currentOrgs.splice(foundIdx, 1);
  localStorage.setItem('da-orgs', JSON.stringify([details.owner, ...currentOrgs].slice(0, 4)));
}

async function setupExperience(el, e) {
  const details = getPathDetails();
  if (details) setRecentOrg(details);
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
    await loadComponent(el, 'da-orgs');
  } else {
    await loadComponent(el, 'da-browse', details);
  }
}

export default async function init(el) {
  await setupExperience(el);

  window.addEventListener('hashchange', async (e) => {
    await setupExperience(el, e);
  });
}
