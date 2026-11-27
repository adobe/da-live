// `apps` sheet: each row is a card on da.live/apps#/org/site (nx blocks/site-apps), which reads the
// site only.

import { all, validator, required, urlOrPath, ref } from '../editors/validators.js';
import { VALIDATION } from '../messages.js';

export const validateRow = validator({
  title: required(VALIDATION.title),
  path: all(
    required(VALIDATION.apps.url),
    urlOrPath('https://da.live/app/org/site/tools/app'),
  ),
  image: urlOrPath('/media/app.png'),
  ref: ref('dev'),
});

export default {
  kind: 'rows',
  idKey: 'title',
  noun: 'app',
  description: 'Apps listed as cards on this site\'s Apps page.',
  validate: validateRow,
  columns: [
    {
      key: 'title',
      label: 'Title',
      hint: 'Card title.',
      required: true,
      placeholder: 'Advanced search',
    },
    {
      key: 'description',
      label: 'Description',
      hint: 'Optional short description on the card.',
      placeholder: 'Search across the site.',
      multiline: true,
    },
    {
      key: 'path',
      label: 'Path',
      hint: 'Where the card links to, e.g. a da.live/app URL.',
      required: true,
      placeholder: 'https://da.live/app/org/site/tools/search',
    },
    {
      key: 'image',
      label: 'Image',
      hint: 'Optional URL or path of the card image.',
      placeholder: 'https://example.com/search.jpg',
    },
    {
      key: 'ref',
      label: 'Ref',
      hint: 'Optional. Only show the card when Apps is opened with ?ref=<value> (or ?ref=dev).',
      placeholder: 'dev',
    },
  ],
};
