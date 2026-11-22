import { SUPPORTED_IMAGE_TYPES } from '../../shared/constants.js';

/**
 * A DropPayload is what is being dropped, independent of where it came from:
 *   { kind: 'files', files: File[] }       OS drops and extensions (uploaded)
 *   { kind: 'html', html: string }         extensions (parsed with the editor schema)
 *   { kind: 'assets', assets: object[] }   AEM Assets rail (resolved, never uploaded)
 */
export const PAYLOAD_KIND = Object.freeze({ FILES: 'files', HTML: 'html', ASSETS: 'assets' });

const MAX_FILES = 10;
const MAX_TEXT_LENGTH = 1_000_000;

// Size limits depend on the site and are enforced at upload time.
function isValidImageFile(file) {
  return file instanceof File && SUPPORTED_IMAGE_TYPES.includes(file.type)
    && !!file.name && file.name.length <= 255
    && !/[\\/\0]/.test(file.name) && !['.', '..'].includes(file.name);
}

function filesPayload(files) {
  if (!files.length || files.length > MAX_FILES || !files.every(isValidImageFile)) return null;
  return { kind: PAYLOAD_KIND.FILES, files };
}

function textToHtml(text) {
  const p = document.createElement('p');
  p.textContent = text;
  return p.outerHTML;
}

/** Native DataTransfer (OS drops): only supported image files are accepted. */
export function fromDataTransfer(dataTransfer) {
  const files = [...(dataTransfer?.files ?? [])]
    .filter((file) => SUPPORTED_IMAGE_TYPES.includes(file.type));
  return filesPayload(files);
}

/** Extension SDK `dragStart` payload: `{ data: { 'text/html'?, 'text/plain'? }, files? }`. */
export function fromSdk(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { data = {}, files = [] } = payload;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(files)) return null;
  const textValid = Object.entries(data).every(([type, value]) => ['text/html', 'text/plain'].includes(type)
    && typeof value === 'string' && value.length <= MAX_TEXT_LENGTH);
  if (!textValid) return null;
  if (files.length) return filesPayload(files);
  if (data['text/html']?.trim()) return { kind: PAYLOAD_KIND.HTML, html: data['text/html'] };
  if (data['text/plain']?.trim()) return { kind: PAYLOAD_KIND.HTML, html: textToHtml(data['text/plain']) };
  return null;
}

function normalizeAsset(asset) {
  const { __original: originalAsset } = asset;
  const original = originalAsset || asset;
  return {
    ...original,
    name: asset.name || original.name || original['repo:name'] || original.asset_name,
    path: asset.path || original.path || original['repo:path']
      || (original.asset_name_path && `${original.asset_name_path}/${original.asset_name}`),
    mimetype: asset.mimetype || original.mimetype || original['dc:format'],
  };
}

/** AEM Asset Selector callback assets; the JSON round trip drops selector callbacks. */
export function fromAssets(assets) {
  if (!Array.isArray(assets) || !assets.length
    || !assets.every((asset) => asset && typeof asset === 'object')) return null;
  try {
    const normalized = JSON.parse(JSON.stringify(assets.map(normalizeAsset)));
    return { kind: PAYLOAD_KIND.ASSETS, assets: normalized };
  } catch {
    return null;
  }
}

/** quick-edit's IMAGE_REPLACE request carries the native file as a data URL. */
export function fromImageData({ imageData, fileName, mimeType }) {
  if (typeof imageData !== 'string' || !imageData.startsWith('data:')) return null;
  const [header, base64Data = ''] = imageData.split(',');
  const type = mimeType || header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(base64Data), (char) => char.charCodeAt(0));
  return filesPayload([new File([bytes], fileName || 'image', { type })]);
}
