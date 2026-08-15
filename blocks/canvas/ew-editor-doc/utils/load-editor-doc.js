import { checkDoc } from './source.js';
import { sourceUrlFromEditorCtx } from './ctx.js';
import { initIms } from '../../../shared/utils.js';

export function sessionErrorFromResponse(resp) {
  const status = resp?.status;
  if (typeof status !== 'number') return { ok: false, error: 'Could not reach the content store' };
  if (resp.ok || status === 404) return null;
  if (status === 401) return { ok: false, error: 'Sign in required' };
  if (status === 403) return { ok: false, error: 'Not permitted' };
  const detail = resp.headers?.get?.('x-error');
  const reason = detail ? `: ${detail}` : '';
  return { ok: false, error: `Could not load the document (${status})${reason}` };
}

// takes the ctx rather than a url, so the sign-in check runs before the store lookup needs a token
export async function resolveEditorDocSession(ctx) {
  const ims = await initIms();
  const token = ims?.accessToken?.token ?? null;
  if (ims?.anonymous || !token) {
    return { ok: false, error: 'Sign in required' };
  }

  let sourceUrl;
  try {
    sourceUrl = await sourceUrlFromEditorCtx(ctx);
  } catch {
    return { ok: false, error: 'Could not reach the content store' };
  }
  if (!sourceUrl) return { ok: false, error: 'Could not reach the content store' };

  const resp = await checkDoc(sourceUrl);
  const failure = sessionErrorFromResponse(resp);
  if (failure) return failure;

  const permissions = resp.permissions || ['read'];
  return { ok: true, token, permissions, sourceUrl };
}
