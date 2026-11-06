// Mock ims.js for tests
let imsResult;
export const handleSignInCalls = [];

export const setImsResult = (result) => { imsResult = result; };

export async function loadIms() {
  // Mock implementation
  return imsResult;
}

export function handleSignIn() {
  handleSignInCalls.push(true);
  // Mirrors the real nx handleSignIn so tests can observe the effect via
  // window.adobeIMS.signIn().
  localStorage.setItem('nx-ims', true);
  if (window.adobeIMS?.signIn) window.adobeIMS.signIn();
}
