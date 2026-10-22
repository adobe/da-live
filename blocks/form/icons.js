import { nothing } from 'da-lit';
import { getNx2 } from '../../scripts/utils.js';

const { getConfig } = await import(`${getNx2()}/scripts/nx.js`);
const { loadHrefSvg } = await import(`${getNx2()}/utils/svg.js`);

const { codeBase } = getConfig();

// Form icons, loaded once from the content-repository sprites via the nx2 svg
// helper (same mechanism as schema-editor / media-library). Each file is a
// standalone S2 icon; `icon()` hands out a clone so the same glyph can render
// in multiple places.
const FILES = {
  add: 's2-icon-add-20-n',
  alert: 's2-icon-alerttriangle-20-n',
  chevronUp: 's2-icon-chevronup-20-n',
  chevronDown: 's2-icon-chevrondown-20-n',
  doubleLeft: 's2-icon-chevrondoubleleft-20-n',
  doubleRight: 's2-icon-chevrondoubleright-20-n',
  reorder: 's2-icon-switchvertical-20-n',
  remove: 's2-icon-delete-20-n',
  settingsEdit: 's2-icon-settingsedit-20-n',
  confirm: 's2-icon-checkmarkcircle-20-n',
  cancel: 's2-icon-closecircle-20-n',
};

const NODES = Object.fromEntries(
  (await Promise.all(
    Object.entries(FILES).map(async ([name, file]) => [
      name,
      await loadHrefSvg(`${codeBase}/img/icons/${file}.svg`),
    ]),
  )).filter(([, svg]) => svg),
);

export function icon(name, className) {
  const svg = NODES[name];
  if (!svg) return nothing;
  const node = svg.cloneNode(true);
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  return node;
}
