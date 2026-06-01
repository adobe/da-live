import { getNx } from '../../../scripts/utils.js';
import '../da-dialog/da-dialog.js';

let mountedInstance = null;

async function triggerSignOut() {
  const { loadIms, handleSignIn, handleSignOut } = await import(`${getNx()}/utils/ims.js`);
  await loadIms();
  if (window.adobeIMS?.getAccessToken()) {
    handleSignOut();
  } else {
    handleSignIn();
  }
}

export function showAuthBanner({
  title = 'Your session has expired',
  message = 'Sign in again to continue.',
  buttonLabel = 'Sign in',
  modal = false,
} = {}) {
  if (mountedInstance?.isConnected) return mountedInstance;

  const dialog = document.createElement('da-dialog');
  dialog.title = title;
  dialog.classList.add('da-auth-banner');
  dialog.showCloseButton = false;
  dialog.modal = modal;

  const msg = document.createElement('p');
  msg.textContent = message;
  dialog.appendChild(msg);

  dialog.action = {
    label: buttonLabel,
    style: 'accent',
    click: () => triggerSignOut(),
  };

  dialog.addEventListener('close', () => {
    if (mountedInstance === dialog) mountedInstance = null;
    dialog.remove();
  });

  // Disable actions and content behind the banner.
  const collabActions = document.querySelector('da-title')
    ?.shadowRoot?.querySelector('.da-title-collab-actions-wrapper');
  const daContent = document.querySelector('da-content');
  const daBrowse = document.querySelector('da-browse');
  if (collabActions) collabActions.inert = true;
  if (daContent) daContent.inert = true;
  if (daBrowse) daBrowse.inert = true;

  dialog.addEventListener('close', () => {
    if (collabActions) collabActions.inert = false;
    if (daContent) daContent.inert = false;
    if (daBrowse) daBrowse.inert = false;
  }, { once: true });

  document.body.appendChild(dialog);
  mountedInstance = dialog;

  return dialog;
}
