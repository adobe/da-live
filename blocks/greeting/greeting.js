import { getNx } from '../../scripts/utils.js';
import { initIms } from '../shared/utils.js';
import initGreeting from '../shared/da-greeting/da-greeting.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const sheets = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('../landing/landing.css', import.meta.url).href),
]);

export default async function init(el) {
  sheets.forEach((sheet) => {
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets.push(sheet);
  });
  el.hidden = true;
  const profile = await initIms();
  const variant = profile?.accessToken && !profile.anonymous ? 'user' : undefined;
  return initGreeting(el, { profile, variant });
}
