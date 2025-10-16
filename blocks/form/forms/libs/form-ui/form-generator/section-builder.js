import { hyphenatePath } from './path-utils.js';
import { UI_CLASS as CLASS } from '../constants.js';
import { render } from 'da-lit';
import { sectionTemplate } from '../templates/section.js';

/**
 * Section builder
 *
 * Create a titled section container and append it to the `childrenHost`.
 * Used for schema nodes that have only nested groups and no primitives.
 *
 * @param {HTMLElement} childrenHost - Where to append the section container
 * @param {string} titleText - Section title
 * @param {string} schemaPathDot - Dotted schema path used to derive id
 * @param {string[]} breadcrumbPath - Human-readable parent path tokens
 * @returns {{sectionId:string, element:HTMLElement}}
 */
export function createSection(childrenHost, titleText, schemaPathDot, breadcrumbPath) {
  const sectionId = `form-section-${hyphenatePath(schemaPathDot)}`;
  const mount = document.createElement('div');
  render(sectionTemplate({ id: sectionId, title: titleText, sectionPath: (breadcrumbPath || []).join(' > ') }), mount);
  const sectionContainer = mount.firstElementChild;
  childrenHost.appendChild(sectionContainer);

  return { sectionId, element: sectionContainer };
}

export default { createSection };


