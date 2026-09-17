import { getNx2 } from '../../../scripts/utils.js';
import { getSidekickConfig } from '../../shared/utils.js';

// 4.5 MB is the default image ceiling, chosen for two reasons that happen to
// agree:
//   1. Backend limit. The DA media upload endpoint runs on Lambda, which caps a
//      request at 6 MiB once base64 has inflated the body. Measured 2026-08-18,
//      the AWS edge answers 413 from 4,717,360 bytes up, and that 413 carries no
//      CORS header, so the browser reads it as a network failure with no status.
//      We check the size before the request instead of surfacing that dead end.
//   2. Reasonable cap. 4.5 MB is also comfortably above what a realistic web
//      image should weigh, so capping here rejects almost nothing an author
//      legitimately wants to publish while catching the outliers early.
// A site's `imageSizeLimit` (in MB) from its sidekick config can only tighten
// this below the ceiling, never raise it above what the backend accepts (see
// `imageLimitMB`). All sites are gated: the ceiling applies until Helix exposes
// a per-site limit.
const MB = 1_000_000;
export const MAX_IMAGE_MB = 4.5;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * MB;

export function isImageTooLarge(bytes, limitBytes = MAX_IMAGE_BYTES) {
  return bytes > limitBytes;
}

export function dataUrlByteLength(dataUrl) {
  const base64 = dataUrl?.split(';base64,')[1];
  if (!base64) return 0;
  const padding = (base64.endsWith('==') && 2) || (base64.endsWith('=') && 1) || 0;
  return Math.floor(base64.length / 4) * 3 - padding;
}

export async function showImageTooLarge(limitMB = MAX_IMAGE_MB) {
  const { showToast, VARIANT_ERROR } = await import(`${getNx2()}/blocks/shared/toast/toast.js`);
  showToast({
    text: `Max image size allowed is ${limitMB} MB`,
    variant: VARIANT_ERROR,
  });
}

// The image size limit for a site, in MB.
//
// Sourced from `imageSizeLimit` on the site's sidekick config so a site can
// tighten the cap without a code change once Helix exposes the field. The read
// goes through `getSidekickConfig`, which memoizes per site, so this is a cheap
// lookup after the first drop and usually already warm from the editor.
//
async function imageLimitMB(org, site) {
  if (!org || !site) return MAX_IMAGE_MB;
  try {
    const config = await getSidekickConfig({ org, site });
    const limit = config?.imageSizeLimit;
    if (Number.isFinite(limit) && limit > 0) return Math.min(limit, MAX_IMAGE_MB);
  } catch { /* fall back to the default ceiling */ }
  return MAX_IMAGE_MB;
}

// `parentPath` is the document's folder, `/org/site/dir`.
export async function refuseOversizedImage(bytes, parentPath) {
  const [, org, site] = (parentPath ?? '').split('/');
  const limitMB = await imageLimitMB(org, site);
  if (!isImageTooLarge(bytes, limitMB * MB)) return false;
  await showImageTooLarge(limitMB);
  return true;
}
