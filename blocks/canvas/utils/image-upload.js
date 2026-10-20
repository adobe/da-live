import { getNx2, getNx2Api } from '../../../scripts/utils.js';

// hlx6 sites upload via the source-bus Lambda, which 413s once a base64 body
// passes ~4.5 MB (measured 2026-08-18; the 413 has no CORS header, so it reads
// as a bare network failure) — so they're capped at 4.5 MB. Legacy DA uploads
// via da-admin, which took 120 MB fine, so they get the 20 MB image limit from
// aem.live/limits. Size is checked before the request to avoid a dead-end upload.

const MB = 1_000_000;
export const HLX6_MAX_IMAGE_BYTES = 4.5 * MB;
export const MAX_IMAGE_BYTES = 20 * MB;

export function dataUrlByteLength(dataUrl) {
  const base64 = dataUrl?.split(';base64,')[1];
  if (!base64) return 0;
  const padding = (base64.endsWith('==') && 2) || (base64.endsWith('=') && 1) || 0;
  return Math.floor(base64.length / 4) * 3 - padding;
}

export async function showImageTooLarge(limitMB) {
  const { showToast, VARIANT_ERROR } = await import(`${getNx2()}/blocks/shared/toast/toast.js`);
  showToast({
    text: `Max image size allowed is ${limitMB} MB`,
    variant: VARIANT_ERROR,
  });
}

// hlx6 sites cap at 4.5 MB, legacy sites at 20 MB. A site we cannot resolve is
// treated as legacy (isHlx6 answers false without a site).
async function imageLimitBytes(org, site) {
  try {
    const { isHlx6 } = await getNx2Api();
    if (await isHlx6(org, site)) return HLX6_MAX_IMAGE_BYTES;
  } catch { /* fall back to the default limit */ }
  return MAX_IMAGE_BYTES;
}

// `parentPath` is the document's folder, `/org/site/dir`.
export async function refuseOversizedImage(bytes, parentPath) {
  // Anything at or under the strictest cap is allowed on every site, so the
  // common case skips the hlx6 probe entirely.
  if (bytes <= HLX6_MAX_IMAGE_BYTES) return false;
  const [, org, site] = (parentPath ?? '').split('/');
  const limitBytes = await imageLimitBytes(org, site);
  if (bytes <= limitBytes) return false;
  await showImageTooLarge(limitBytes / MB);
  return true;
}
