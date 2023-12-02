import { getPathDetails } from '../edit/shared/utils.js';

async function loadComponent(el, cmpName, details) {
  await import(`./${cmpName}/${cmpName}.js`);
  const cmp = document.createElement(`${cmpName}`);
  if (details) cmp.details = details;
  el.append(cmp);
}

async function setupExperience(el) {
  el.innerHTML = '';
  const details = getPathDetails();
  if (!details) {
    loadComponent(el, 'da-orgs');
  } else {
    loadComponent(el, 'da-browse', details);
  }
}

export default async function init(el) {
  await setupExperience(el);

  window.addEventListener('hashchange', async () => {
    await setupExperience(el);
  });
}
