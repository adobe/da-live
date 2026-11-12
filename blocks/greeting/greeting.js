import { getNx, getNx2 } from '../../scripts/utils.js';
import initGreeting from '../shared/da-greeting/da-greeting.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { loadIms } = await import(`${getNx2()}/utils/ims.js`);
const styles = await loadStyle(import.meta.url);

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(styles)) {
    document.adoptedStyleSheets.push(styles);
  }
  return initGreeting(el, { profile: loadIms() });
}
