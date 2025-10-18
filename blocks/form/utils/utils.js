import { daFetch } from '../../shared/utils.js';
import { htmlToJson } from '../forms/libs/services/storage/html-storage.js';

export async function convertHtmlToJson(html) {
  return htmlToJson(html);
}

export function convertJson2Html(doc) {
  console.log(doc);
}

export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}
