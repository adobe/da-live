import { getNx } from '../../scripts/utils.js';
import { initIms } from '../shared/utils.js';
import initGreeting from '../shared/da-greeting/da-greeting.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const sheet = await loadStyle(import.meta.url);

export default async function init(el) {
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets.push(sheet);
  el.hidden = true;
  const profile = await initIms();
  const variant = profile?.accessToken && !profile.anonymous ? 'user' : undefined;
  return initGreeting(el, { profile, variant });
}
