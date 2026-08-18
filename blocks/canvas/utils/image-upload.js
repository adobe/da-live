import { getNx2 } from '../../../scripts/utils.js';

// The api service runs on Lambda, which caps a request at 6 MiB once base64 has
// inflated the body. Measured 2026-08-18, the AWS edge answers 413 from 4,717,360
// bytes up, and that 413 carries no CORS header, so the browser reads it as a
// network failure with no status. The size is checked before the request instead.
export const MAX_IMAGE_BYTES = 4500000;
const MAX_IMAGE_LABEL = '4.5 MB';

export function isImageTooLarge(bytes) {
  return bytes > MAX_IMAGE_BYTES;
}

export function dataUrlByteLength(dataUrl) {
  const base64 = dataUrl?.split(';base64,')[1];
  if (!base64) return 0;
  const padding = (base64.endsWith('==') && 2) || (base64.endsWith('=') && 1) || 0;
  return Math.floor(base64.length / 4) * 3 - padding;
}

export async function showImageTooLarge() {
  const { showToast } = await import(`${getNx2()}/blocks/shared/toast/toast.js`);
  showToast({
    text: `Image upload failed\nImage size must be ${MAX_IMAGE_LABEL} or under`,
    variant: 'error',
  });
}
