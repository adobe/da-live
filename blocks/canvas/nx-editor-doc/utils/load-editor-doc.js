import { checkDoc } from './source.js';
import { getNx } from '../../../shared/nxutils.js';

export async function resolveEditorDocSession(sourceUrl) {
  const { loadIms } = await import(`${getNx()}/utils/ims.js`);
  const ims = await loadIms();
  const token = ims?.accessToken?.token ?? null;
  if (ims?.anonymous || !token) {
    return { ok: false, error: 'Sign in required' };
  }

  const resp = await checkDoc(sourceUrl);
  if (!resp.ok && resp.status !== 404) {
    const error = resp.status === 401 ? 'Sign in required' : `Failed to load (${resp.status})`;
    return { ok: false, error };
  }

  const permissions = resp.permissions || ['read'];
  return { ok: true, token, permissions };
}
