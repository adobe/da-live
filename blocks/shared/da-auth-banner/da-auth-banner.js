import { getNx } from '../../../scripts/utils.js';
import '../da-dialog/da-dialog.js';

let mountedInstance = null;

async function triggerSignIn() {
  const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
  await loadIms();
  handleSignIn();
}

export function showAuthBanner() {
  if (mountedInstance?.isConnected) return mountedInstance;

  const dialog = document.createElement('da-dialog');
  dialog.title = 'Your session has expired';
  dialog.classList.add('da-auth-banner');
  dialog.showCloseButton = false;

  const msg = document.createElement('p');
  msg.textContent = 'Sign in again to continue.';
  dialog.appendChild(msg);

  dialog.action = {
    label: 'Sign in',
    style: 'accent',
    click: triggerSignIn,
  };

  dialog.addEventListener('close', () => {
    if (mountedInstance === dialog) mountedInstance = null;
    dialog.remove();
  });

  document.body.appendChild(dialog);
  mountedInstance = dialog;

  return dialog;
}
