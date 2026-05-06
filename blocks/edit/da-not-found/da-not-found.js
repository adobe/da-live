import '../../shared/da-dialog/da-dialog.js';
import { daFetch } from '../../shared/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { getNx, nxJS } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}${nxJS}`);
await loadStyle('/blocks/edit/da-not-found/da-not-found.css');

async function folderHasContents(folderPath) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/list${folderPath}`);
    if (!resp.ok) return false;
    const json = await resp.json();
    return Array.isArray(json) && json.length > 0;
  } catch {
    return false;
  }
}

export default async function showNotFoundDialog(details) {
  const folderPath = details.fullpath.replace(/\.html$/, '');
  const listPath = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;

  let dialog = null;
  let resolved = false;
  let resolveFn;
  const promise = new Promise((r) => { resolveFn = r; });

  // eslint-disable-next-line no-use-before-define
  const onHashChange = () => finish('hashchange');
  function finish(result) {
    if (resolved) return;
    resolved = true;
    window.removeEventListener('hashchange', onHashChange);
    resolveFn(result);
    if (dialog) dialog.close();
  }

  // Attach listener BEFORE the async folder check so a hashchange during the
  // fetch also cancels this dialog flow — otherwise the old edit URL's dialog
  // would flash over the editor that the new hash loaded.
  window.addEventListener('hashchange', onHashChange);

  const folderExists = await folderHasContents(listPath);
  if (resolved) return promise;

  dialog = document.createElement('da-dialog');
  dialog.title = 'Document not found';
  dialog.classList.add('da-not-found-dialog');

  const docName = details.name.replace(/\.html$/, '');
  const intro = document.createElement('p');
  intro.innerHTML = folderExists
    ? `There is no document named <b><em>${docName}</em></b> at this path, but there is a folder with that name.`
    : `There is no document named <b><em>${docName}</em></b> at this path.`;
  dialog.appendChild(intro);

  const prompt = document.createElement('p');
  prompt.textContent = 'What would you like to do?';
  dialog.appendChild(prompt);

  dialog.action = {
    label: 'Create document',
    style: 'accent',
    click: () => finish('create'),
  };

  const cancelBtn = document.createElement('sl-button');
  cancelBtn.className = 'primary outline';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.slot = 'footer-left';
  cancelBtn.addEventListener('click', () => finish('cancel'));
  dialog.appendChild(cancelBtn);

  if (folderExists) {
    const folderBtn = document.createElement('sl-button');
    folderBtn.className = 'primary outline';
    folderBtn.textContent = 'Open folder';
    folderBtn.slot = 'footer-left';
    folderBtn.addEventListener('click', () => finish('folder'));
    dialog.appendChild(folderBtn);
  }

  dialog.addEventListener('close', () => {
    finish('cancel');
    dialog.remove();
  });

  document.body.appendChild(dialog);
  return promise;
}
