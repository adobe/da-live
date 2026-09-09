import { buildSourceUrl, checkDoc } from './source.js';
import { initIms } from '../../../shared/utils.js';

export function sessionErrorFromResponse(resp) {
  const status = resp?.status;
  if (typeof status !== 'number') return { ok: false, error: 'Could not reach the content store' };
  if (resp.ok) return null;
  // A missing document is not an error: the caller prompts the author to create it.
  if (status === 404) return { ok: false, notFound: true };
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
    sourceUrl = await buildSourceUrl(ctx?.path);
  } catch {
    return { ok: false, error: 'Could not reach the content store' };
  }
  if (!sourceUrl) return { ok: false, error: 'Could not reach the content store' };

  const resp = await checkDoc(sourceUrl);
  const failure = sessionErrorFromResponse(resp);
  if (failure) {
    // Thread the token and sourceUrl through so a create-on-not-found flow
    // can save the empty document and mount the editor without a second lookup.
    if (failure.notFound) return { ok: false, notFound: true, token, sourceUrl };
    return failure;
  }

  const permissions = resp.permissions || ['read'];
  return { ok: true, token, permissions, sourceUrl };
}

// Builds the mounted session after a create-on-not-found save. The write grant
// must come from the save response: the not-found session's permissions were
// defaulted to read (a HEAD 404 carries no grant), so reusing them would drop
// the author into a read-only editor on a document they just created.
export function createdDocSession(notFoundSession, createResp) {
  return {
    ok: true,
    token: notFoundSession.token,
    permissions: createResp?.permissions || ['read'],
    sourceUrl: notFoundSession.sourceUrl,
  };
}
