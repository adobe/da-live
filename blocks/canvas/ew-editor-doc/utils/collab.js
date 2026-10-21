import { initIms as loadIms } from '../../../shared/utils.js';

export async function getCollabIdentity() {
  try {
    const ims = await loadIms();
    if (ims?.anonymous) return null;
    const name = (ims?.displayName || ims?.name || '').trim();
    const email = ims?.email || '';
    const id = ims?.userId || email;
    if (name && id) {
      return {
        name,
        id,
        email,
        colorSeed: email || ims?.userId || name,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
