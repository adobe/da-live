// `prepare` sheet. The editor
// (blocks/edit/da-prepare) merges built-ins, org rows and site rows by title, later wins.

import {
  all, validator, required, urlOrPath, icon, ref,
} from '../editors/validators.js';
import { VALIDATION } from '../messages.js';

// Adobe-provided actions: a row with one of these titles and no path turns it on.
const BUILT_IN = ['Preflight', 'Unpublish', 'Schedule Publish', 'Send to Adobe Target'];

export const validateRow = validator({
  title: required(VALIDATION.title),
  path: all(
    (value, row) => !value && !BUILT_IN.includes(row.title)
      && VALIDATION.prepare.urlOrBuiltIn(BUILT_IN),
    urlOrPath('/tools/plugin.html'),
  ),
  icon,
  ref: ref('uat'),
});

export default {
  kind: 'rows',
  idKey: 'title',
  noun: 'menu item',
  description: 'Choose the actions authors see in the Prepare menu next to Preview and Publish.',
  validate: validateRow,
  columns: [
    {
      key: 'title',
      label: 'Title',
      hint: 'Shown to authors. A row with the same title as an org or built-in action replaces it.',
      required: true,
      placeholder: 'Rollout',
    },
    {
      key: 'path',
      label: 'Path',
      hint: `URL of the plugin, or a path on this site. Leave empty to turn on a built-in action: ${BUILT_IN.join(', ')}.`,
      placeholder: 'https://da.live/nx/public/plugins/rollout.html',
    },
    {
      key: 'icon',
      label: 'Icon',
      hint: 'Optional URL or site path of the icon; add #id for an SVG symbol. SVGs must allow cross-origin requests.',
      placeholder: 'https://example.com/icon.svg',
    },
    {
      key: 'ref',
      label: 'Ref',
      hint: 'Optional. Only show the action when the editor is opened with ?ref=<value>, e.g. uat.',
      placeholder: 'uat',
    },
    {
      key: 'experience',
      label: 'Opens in',
      hint: 'How the plugin opens.',
      options: [{ value: 'fullsize-dialog', label: 'Full-size dialog' }],
      emptyLabel: 'Dialog (default)',
    },
  ],
};
