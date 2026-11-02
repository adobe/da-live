import { getNx2 } from '../../../scripts/utils.js';

const { getConfigValue } = await import(`${getNx2()}/utils/daConfig.js`);

export const JSON_PREVIEW_KEY = 'editor.structuredContent.jsonPreview';

export async function isJsonPreviewEnabled({ org, site }) {
  const value = await getConfigValue({ org, site, key: JSON_PREVIEW_KEY });
  return String(value ?? '').trim().toLowerCase() !== 'false';
}
