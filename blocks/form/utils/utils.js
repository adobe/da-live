import { daFetch } from '../../shared/utils.js';
import HTMLToJSON from './converters.js';

/** Convert HTML to JSON using HTMLToJSON converter. */
export async function convertHtmlToJson(html) {
  const { json } = new HTMLToJSON(html);
  return json;
}

/** Load HTML from source URL. */
export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}
