// ew.* flags as read by nx2 utils/ewFlags.js and blocks/canvas/utils (site overrides org).

import { SETUP } from '../messages.js';

const SETUP_APP = 'https://da.live/app/adobe-rnd/ew-extensions/tools/ew-setup/ew-setup';

export default {
  description: 'Turn on Experience Workspace and choose how the editor opens for authors.',
  // Site scope: until `ew.enabled` is set (on the site or org), show the ew-setup app instead,
  // which also points the site's Sidekick to the new editor. The app reads #/org/site.
  setup: {
    key: 'ew.enabled',
    text: SETUP.experienceWorkspace,
    action: 'Set up Experience Workspace',
    url: (org, site) => `${SETUP_APP}#/${org}/${site}`,
  },
  fields: [
    {
      key: 'ew.enabled',
      label: 'Experience Workspace',
      hint: 'Use the Experience Workspace editor for this content.',
      // Only `true` turns it on, so `false` lets a site override an org `true`.
      options: [{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }],
      emptyLabel: 'Default (off)',
    },
    {
      key: 'ew.disableChat',
      label: 'AI Assistant',
      hint: 'Show the AI Assistant chat to authors.',
      // The flag disables chat, so `true` hides it.
      options: [{ value: 'false', label: 'Shown' }, { value: 'true', label: 'Hidden' }],
      emptyLabel: 'Default (shown)',
    },
    {
      key: 'ew.canvasDefaultView',
      label: 'Default editor view',
      hint: 'View the canvas opens in. Authors\' own choice wins for the rest of their session.',
      options: [
        { value: 'layout', label: 'Layout' },
        { value: 'content', label: 'Content' },
        { value: 'split', label: 'Split' },
      ],
      emptyLabel: 'Default (layout)',
    },
    {
      key: 'ew.canvasDefaultPanel',
      label: 'Default side panel',
      hint: 'Panel the canvas opens with. Library panels appear only when the site library has them.',
      options: [
        { value: 'outline', label: 'Outline' },
        { value: 'files', label: 'Files' },
        { value: 'versions', label: 'Versions' },
        { value: 'preflight', label: 'Preflight' },
        { value: 'comments', label: 'Comments' },
        { value: 'metadata', label: 'Metadata' },
        { value: 'blocks', label: 'Blocks' },
        { value: 'templates', label: 'Templates' },
        { value: 'icons', label: 'Icons' },
        { value: 'placeholders', label: 'Placeholders' },
      ],
      emptyLabel: 'Default (outline)',
    },
  ],
};
