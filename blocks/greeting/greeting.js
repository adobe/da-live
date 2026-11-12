import { getNx, getNx2 } from '../../scripts/utils.js';
import initGreeting from '../shared/da-greeting/da-greeting.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { loadIms } = await import(`${getNx2()}/utils/ims.js`);
const sheets = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('../landing/landing.css', import.meta.url).href),
]);

export default function init(el) {
  sheets.forEach((sheet) => {
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets.push(sheet);
  });
  return initGreeting(el, { profile: loadIms() });
}
