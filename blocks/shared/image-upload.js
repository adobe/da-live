import { getNx2, getNx2Api } from '../../scripts/utils.js';

// hlx6 sites upload through the source bus Lambda, which answers 413 once a base64 body
// passes about 4.5 MB (measured 2026-08-18). That 413 has no CORS header, so it reads as a
// bare network failure. Legacy DA sites upload through da-admin, which took 120 MB fine,
// so they get the 20 MB image limit from aem.live/limits. The size is checked before the
// request to avoid a dead end upload.

const MB = 1_000_000;
export const HLX6_MAX_IMAGE_BYTES = 4.5 * MB;
export const MAX_IMAGE_BYTES = 20 * MB;

const BASE64_MARKER = ';base64,';
const BASE64_PADDING = '=';
const BASE64_BYTES_PER_BLOCK = 3;
const BASE64_CHARS_PER_BLOCK = 4;

/**
 * @param {string} base64 The base64 data.
 * @returns {number} The number of padding characters at its end.
 */
function paddingLength(base64) {
  if (base64.endsWith(BASE64_PADDING.repeat(2))) {
    return 2;
  }
  if (base64.endsWith(BASE64_PADDING)) {
    return 1;
  }
  return 0;
}

/**
 * Computes the decoded size of a base64 data URL without decoding it.
 * @param {string} [dataUrl] The data URL.
 * @returns {number} The size in bytes, or 0 when the URL holds no base64 data.
 */
export function dataUrlByteLength(dataUrl) {
  const base64 = dataUrl?.split(BASE64_MARKER)[1];
  if (!base64) {
    return 0;
  }

  const blocks = Math.floor(base64.length / BASE64_CHARS_PER_BLOCK);
  return blocks * BASE64_BYTES_PER_BLOCK - paddingLength(base64);
}

/**
 * Tells the author that the image is over the size limit.
 * @param {number} limitMB The limit in MB.
 * @returns {Promise<void>}
 */
export async function showImageTooLarge(limitMB) {
  const { showToast, VARIANT_ERROR } = await import(`${getNx2()}/blocks/shared/toast/toast.js`);
  showToast({
    text: `Max image size allowed is ${limitMB} MB`,
    variant: VARIANT_ERROR,
  });
}

/**
 * Resolves the image size limit of a site. A site that cannot be resolved is treated as
 * legacy, because `isHlx6` answers false without a site.
 * @param {string} [org] The organization.
 * @param {string} [site] The site.
 * @returns {Promise<number>} The limit in bytes.
 */
async function imageLimitBytes(org, site) {
  try {
    const { isHlx6 } = await getNx2Api();
    if (await isHlx6(org, site)) {
      return HLX6_MAX_IMAGE_BYTES;
    }
  } catch {
    // The default limit applies.
  }
  return MAX_IMAGE_BYTES;
}

/**
 * Refuses an image over the size limit of its site and tells the author why.
 * @param {number} bytes The image size in bytes.
 * @param {string} [parentPath] The document's folder, `/org/site/dir`.
 * @returns {Promise<boolean>} Whether the image was refused.
 */
export async function refuseOversizedImage(bytes, parentPath) {
  // Anything at or under the strictest limit is allowed on every site, so the common
  // case skips the hlx6 probe.
  if (bytes <= HLX6_MAX_IMAGE_BYTES) {
    return false;
  }

  const [, org, site] = (parentPath ?? '').split('/');
  const limitBytes = await imageLimitBytes(org, site);
  if (bytes <= limitBytes) {
    return false;
  }

  await showImageTooLarge(limitBytes / MB);
  return true;
}
