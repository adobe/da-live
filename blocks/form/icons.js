import { nothing } from 'da-lit';
import { getNx2 } from '../../scripts/utils.js';

const { getConfig } = await import(`${getNx2()}/scripts/nx.js`);
const { loadHrefSvg } = await import(`${getNx2()}/utils/svg.js`);

/** The base URL of the code that serves the icon files. */
const { codeBase } = getConfig();

/**
 * The file names of the form icons, by icon name. The icons load once from the
 * content-repository sprites through the nx2 svg helper, the same mechanism as the schema
 * editor and the media library. Each file is a standalone S2 icon.
 */
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
  replace: 's2-icon-replace-20-n',
  copy: 's2-icon-copy-20-n',
  copied: 's2-icon-checkmark-20-n',
  altText: 's2-icon-imagetext-20-n',
};

/** The loaded icon elements, by icon name. Icons that failed to load are left out. */
const NODES = Object.fromEntries(
  (await Promise.all(
    Object.entries(FILES).map(async ([name, file]) => [
      name,
      await loadHrefSvg(`${codeBase}/img/icons/${file}.svg`),
    ]),
  )).filter(([, svg]) => svg),
);

/**
 * Renders a form icon. Each call hands out a clone, so the same glyph can render in
 * several places. Icons are decorative, so they are hidden from assistive technology.
 * @param {string} name The icon name, see `FILES`.
 * @param {string} [className] The classes of the icon element.
 * @returns {SVGElement|typeof nothing} The icon, or nothing when it did not load.
 */
export function icon(name, className) {
  const svg = NODES[name];
  if (!svg) {
    return nothing;
  }

  const node = svg.cloneNode(true);
  node.setAttribute('aria-hidden', 'true');
  if (className) {
    node.setAttribute('class', className);
  }
  return node;
}
