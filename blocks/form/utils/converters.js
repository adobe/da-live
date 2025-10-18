import { htmlToJson } from '../forms/libs/services/storage/html-storage.js';

export async function convertHtmlToJson(html) {
  const json = await htmlToJson(html);
  console.log(json);
}

export function convertJson2Doc(doc) {
  console.log(doc);
}
