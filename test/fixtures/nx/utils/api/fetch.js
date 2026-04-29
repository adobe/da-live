// Minimal test fixture for da-nx api/fetch.js. Reads window.fetch lazily so
// tests can substitute fetch after the module is loaded.
export const daFetch = async (url, opts = {}) => {
  const resp = await window.fetch(url, opts);
  resp.permissions = ['read', 'write'];
  return resp;
};

export async function initIms() { return null; }
export async function getAuthToken() { return null; }
export function setImsDetails() {}
