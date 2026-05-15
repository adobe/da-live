import { getNx } from '../../../scripts/utils.js';
import '../da-dialog/da-dialog.js';

// Hide da-dialog's close button — the auth modal is intentionally blocking,
// the only escape is to sign in (or cross-tab auth monitor reload).
const HIDE_CLOSE = new CSSStyleSheet();
HIDE_CLOSE.replaceSync('.da-dialog-close-btn { display: none; }');

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

  // Inject our stylesheet into the dialog's shadow root so the close button
  // CSS reaches inside the encapsulation boundary.
  dialog.updateComplete.then(() => {
    if (!dialog.shadowRoot) return;
    dialog.shadowRoot.adoptedStyleSheets = [...dialog.shadowRoot.adoptedStyleSheets, HIDE_CLOSE];
  });

  return dialog;
}
