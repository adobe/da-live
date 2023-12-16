import getPathDetails from '../shared/pathDetails.js';

async function loadComponent(el, cmpName, details) {
  el.innerHTML = '';
  await import(`./${cmpName}/${cmpName}.js`);
  const cmp = document.createElement(`${cmpName}`);
  if (details) cmp.details = details;
  el.append(cmp);
}

async function setupExperience(el, e) {
  const details = getPathDetails();
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
    loadComponent(el, 'da-orgs');
  } else {
    loadComponent(el, 'da-browse', details);
  }
}

export default async function init(el) {
  await setupExperience(el);

  window.addEventListener('hashchange', async (e) => {
    await setupExperience(el, e);
  });
}
