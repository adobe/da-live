// Plugin rows of the `library` sheet, read by blocks/canvas/ew-panel-extensions: org + site rows,
// matched by name, site wins. The built-in library entries in the same sheet belong to the Library
// tab and are left alone.

import {
  all, validator, required, isPath, icon, ref,
} from '../editors/validators.js';
import { VALIDATION } from '../messages.js';

// The canvas names each row from its title, so "My Tool" and "my tool" are the same plugin.
const nameOf = (row) => (row.title ?? '').trim().toLowerCase().replaceAll(' ', '-');

const LIBRARY_ENTRIES = new Set(['blocks', 'templates', 'icons', 'placeholders', 'aem-assets']);

export const validateRow = validator({
  title: all(
    required(VALIDATION.title),
    (value) => LIBRARY_ENTRIES.has(nameOf({ title: value })) && VALIDATION.plugins.reserved,
  ),
  path: all(
    required(VALIDATION.plugins.url),
    (value) => !value.split(',').every((part) => isPath(part.trim()))
      && VALIDATION.plugins.urls,
  ),
  icon,
  ref: ref('uat'),
});

export default {
  kind: 'rows',
  idKey: 'title',
  idOf: nameOf,
  owns: (row) => !LIBRARY_ENTRIES.has(nameOf(row)),
  noun: 'plugin',
  description: 'Choose the plugins authors can open from the editor side panel.',
  validate: validateRow,
  columns: [
    {
      key: 'title',
      label: 'Title',
      hint: 'Panel name. A plugin with the same name as an org plugin replaces it.',
      required: true,
      placeholder: 'Media Library',
    },
    {
      key: 'path',
      label: 'Path',
      hint: 'URL of the plugin, or a path on this site. Separate several sources with commas.',
      required: true,
      placeholder: 'https://main--site--org.aem.live/tools/plugins/my-plugin.html',
    },
    {
      key: 'icon',
      label: 'Icon',
      hint: 'Optional URL or site path of the icon; add #id for an SVG symbol.',
      placeholder: 'https://example.com/icon.svg',
    },
    {
      key: 'experience',
      label: 'Opens in',
      hint: 'How the plugin opens.',
      // The classic editor opens any value containing "dialog" in a dialog; the canvas only knows
      // fullsize-dialog and window and shows everything else in the side panel.
      options: [
        { value: 'dialog', label: 'Dialog (classic editor)' },
        { value: 'fullsize-dialog', label: 'Full-size dialog' },
        { value: 'window', label: 'New window' },
      ],
      emptyLabel: 'Side panel (default)',
    },
    {
      key: 'ref',
      label: 'Ref',
      hint: 'Optional. Only show the plugin when the editor is opened with ?ref=<value>.',
      placeholder: 'uat',
    },
  ],
};
