// Test fixture mirroring nx2/utils/media-upload.js.
import { isHlx6, source } from './api.js';

const MB = 1_000_000;

export const SUPPORTED_IMAGE_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif'];
export const HLX6_MAX_IMAGE_BYTES = 4.5 * MB;
export const MAX_IMAGE_BYTES = 20 * MB;

export const imageTooLargeMessage = ({ limitBytes }) => `Max image size allowed is ${limitBytes / MB} MB`;

export async function getImageUploadLimit({ org, site, size = 0, checkHlx6 = isHlx6 }) {
  if (size <= HLX6_MAX_IMAGE_BYTES) return HLX6_MAX_IMAGE_BYTES;
  try {
    if (await checkHlx6(org, site)) return HLX6_MAX_IMAGE_BYTES;
  } catch { /* an unresolved site uses the legacy limit */ }
  return MAX_IMAGE_BYTES;
}

export const getMediaUploadPath = ({ parent, name, fileName }) => `${parent}/.${name}/${fileName}`;

export async function uploadMedia({ path, body, upload = source.uploadMedia }) {
  const resp = await upload(path, { body });
  if (!resp?.ok) {
    return { error: `Upload failed with status ${resp?.status ?? 'unknown'}.`, status: resp?.status };
  }
  const json = await resp.json().catch(() => undefined);
  const href = json?.source?.contentUrl;
  if (!href) return { error: 'The upload did not return a usable file URL.', status: resp.status };
  return { href };
}
