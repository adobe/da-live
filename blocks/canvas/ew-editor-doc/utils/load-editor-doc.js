import { checkDoc } from './source.js';
import { initIms } from '../../../shared/utils.js';

export function sessionFromResponse(resp, token) {
  const permissions = resp.permissions || ['read'];
  const docId = resp.headers?.get?.('x-da-id') ?? null;
  return { ok: true, token, permissions, docId };
}

export async function resolveEditorDocSession(sourceUrl) {
  const ims = await initIms();
  const token = ims?.accessToken?.token ?? null;
  if (ims?.anonymous || !token) {
    return { ok: false, error: 'Sign in required' };
  }

  const resp = await checkDoc(sourceUrl);
  if (!resp.ok && resp.status !== 404) {
    const error = resp.status === 401 ? 'Sign in required' : 'Not permitted';
    return { ok: false, error };
  }

  return sessionFromResponse(resp, token);
}
