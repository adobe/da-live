import { getNx } from '../../scripts/utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);

const styles = await loadStyle(import.meta.url);
document.adoptedStyleSheets.push(styles);

export async function handleRoute(el, details) {
  await import('./da-config/da-config.js');
  let cmp = el.querySelector('da-config');
  if (!cmp) {
    cmp = document.createElement('da-config');
    el.append(cmp);
  }
  cmp.org = details?.org ?? null;
  cmp.site = details?.site ?? null;
  return cmp;
}

export default function init(el) {
  el.replaceChildren();
  hashChange.subscribe((details) => { handleRoute(el, details); });
}
