import defaultContent from './default-content.js';
import aem2prose from './helpers.js';
import { daFetch } from '../../shared/utils.js'


export default async function getContent(path) {
  if (!path) return defaultContent();
  try {
    const resp = await daFetch(`${path}`);
    if (resp.status !== 200) return defaultContent();
    const html = await resp.text();

    // TODO: demo purposes only
    if (!html) return defaultContent();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    return aem2prose(doc);
  } catch {
    return defaultContent();
  }
}
