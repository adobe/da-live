import '../../shared/da-dialog/da-dialog.js';

// A missing document's canvas path reduces to its site root, which is EW's
// document library (the file-explorer panel). Folder paths are not valid canvas
// locations - loading one as a document would 404 and re-open this dialog - so
// Cancel always returns to the library rather than the immediate parent folder.
export function libraryHashFromPath(path) {
  const [org, site] = (path || '').split('/');
  return org && site ? `#/${org}/${site}` : '#/';
}

// Mirrors blocks/edit/da-not-found: a promise-returning modal that resolves to
// 'create' | 'cancel' | 'hashchange'. Navigating away (hashchange) cancels the
// prompt so a stale not-found dialog can't flash over the newly loaded editor.
export default function showEwNotFoundDialog({ name }) {
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
  window.addEventListener('hashchange', onHashChange);

  dialog = document.createElement('da-dialog');
  dialog.title = 'Document not found';

  // Build the message with DOM nodes rather than innerHTML so the document name
  // (a URL path segment) can't inject markup.
  const intro = document.createElement('p');
  intro.append('There is no document named ');
  const strong = document.createElement('b');
  const em = document.createElement('em');
  em.textContent = name;
  strong.appendChild(em);
  intro.append(strong, ' at this path.');
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

  dialog.addEventListener('close', () => {
    finish('cancel');
    dialog.remove();
  });

  document.body.appendChild(dialog);
  return promise;
}
