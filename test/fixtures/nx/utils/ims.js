// Mock ims.js for tests
let profile;
export async function loadIms() {
  return profile;
}

export const setImsProfile = (value) => { profile = value; };

export function handleSignIn() {
  // Mirrors the real nx handleSignIn so tests can observe the effect via
  // window.adobeIMS.signIn().
  localStorage.setItem('nx-ims', true);
  if (window.adobeIMS?.signIn) window.adobeIMS.signIn();
}
