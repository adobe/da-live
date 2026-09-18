import { getNx2, getNx2Api } from '../../../scripts/utils.js';

// hlx6 sites upload through the source-bus, which runs on Lambda and caps a
// request at 6 MiB once base64 has inflated the body. Measured 2026-08-18, the
// AWS edge answers 413 from 4,717,360 bytes up, and that 413 carries no CORS
// header, so the browser reads it as a network failure with no status. Those
// sites are held to 4.5 MB. Legacy DA sites upload through da-admin, which took
// a 120 MB body in the same probe, so they are held to the 20 MB image limit
// documented on aem.live/limits instead. Either way the size is checked before
// the request so authors get feedback instead of a dead-end upload.
const MB = 1_000_000;
export const HLX6_MAX_IMAGE_MB = 4.5;
export const MAX_IMAGE_MB = 20;
export const HLX6_MAX_IMAGE_BYTES = HLX6_MAX_IMAGE_MB * MB;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * MB;

export function isImageTooLarge(bytes, limitBytes) {
  return bytes > limitBytes;
}

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
async function imageLimitMB(org, site) {
  try {
    const { isHlx6 } = await getNx2Api();
    if (await isHlx6(org, site)) return HLX6_MAX_IMAGE_MB;
  } catch { /* fall back to the documented default limit */ }
  return MAX_IMAGE_MB;
}

// `parentPath` is the document's folder, `/org/site/dir`.
export async function refuseOversizedImage(bytes, parentPath) {
  // Anything at or under the strictest cap is allowed on every site, so the
  // common case skips the hlx6 probe entirely.
  if (!isImageTooLarge(bytes, HLX6_MAX_IMAGE_BYTES)) return false;
  const [, org, site] = (parentPath ?? '').split('/');
  const limitMB = await imageLimitMB(org, site);
  if (!isImageTooLarge(bytes, limitMB * MB)) return false;
  await showImageTooLarge(limitMB);
  return true;
}
