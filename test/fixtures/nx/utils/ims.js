// Mock ims.js for tests
export async function loadIms() {
  // Mock implementation
  return Promise.resolve();
}

export function handleSignIn() {
  // Mirrors the real nx handleSignIn so tests can observe the effect via
  // window.adobeIMS.signIn().
  localStorage.setItem('nx-ims', true);
  if (window.adobeIMS?.signIn) window.adobeIMS.signIn();
}
