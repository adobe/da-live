import { DA_CONTENT } from '../../shared/nxutils.js';
import { daFetch } from '../../shared/utils.js';

export function getPreviewOrigin(org, repo) {
  const hostname = window?.location?.hostname ?? '';
  const domain = hostname.endsWith('aem.page') || hostname.endsWith('localhost')
    ? 'stage-preview.da.live'
    : 'preview.da.live';
  return `https://main--${repo}--${org}.${domain}`;
}

export async function fetchWysiwygCookie({ org, repo, token }) {
  if (!org || !repo || !token) {
    throw new Error('fetchWysiwygCookie: org, repo, and token required');
  }
  const previewUrl = `${getPreviewOrigin(org, repo)}/gimme_cookie`;
  const contentUrl = `${DA_CONTENT}/${org}/${repo}/.gimme_cookie`;

  const previewResp = await daFetch(previewUrl, { method: 'GET', credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
  if (!previewResp.ok) {
    throw new Error(`gimme_cookie preview failed: status ${previewResp.status}`);
  }

  try {
    const contentResp = await fetch(contentUrl, { method: 'GET', credentials: 'include' });
    if (!contentResp.ok) {
      // eslint-disable-next-line no-console
      console.warn('[canvas:wysiwyg] content gimme_cookie non-ok (non-fatal)', contentResp.status);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[canvas:wysiwyg] content gimme_cookie failed (non-fatal)', e?.message);
  }
}
