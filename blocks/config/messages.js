// Every message the config UI shows: validation errors, status lines, notes, toasts, dialogs and
// progress. Labels, hints, placeholders and descriptions stay with the fields and panels they
// describe. Keep wording consistent: errors say what to do ("Enter …", "Use …"), failures read
// "Could not <action> (<reason>).".

import { html } from 'da-lit';

const code = (text) => html`<code>${text}</code>`;

// Why a request failed: its HTTP status, the network error, or 'network error'. Only a numeric
// `status` counts, since load states use `status` for 'loading' / 'error'.
export const reason = ({ status, httpStatus, error } = {}) => httpStatus
  || (typeof status === 'number' ? status : 0) || error || 'network error';

// "Could not <action> (<reason>)." as plain text, for toasts and thrown errors.
export const failure = (action, result) => `Could not ${action} (${reason(result)}).`;

// The reason as a sentence, under a failure title such as "Could not load configuration".
export const failureDetail = (result) => {
  const why = reason(result);
  return typeof why === 'number' ? `The server responded with ${why}.` : `The request failed (${why}).`;
};

// "1 change", "2 changes".
export const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const SHELL = {
  noOrg: 'No organization in the URL. Enter one to manage its configuration.',
  loading: (scope) => `Loading configuration for ${scope}…`,
  noAccessTitle: 'No access',
  noAccess: 'You don\'t have access to this configuration.',
  loadFailed: 'Could not load configuration',
  readOnly: 'You have read-only access to this configuration.',
  learnMore: 'Learn more',
  openSheet: 'Open sheet',
  saved: 'Changes saved.',
  saveFailed: (result) => failure('save changes', result),
  setupLibraryFailed: (result) => failure('set up the library', result),
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  unsavedCount: (count) => plural(count, 'unsaved change'),
  saveFirst: 'Save or discard your changes first',
  discardTitle: 'Discard unsaved changes?',
  discardText: (section) => `Your changes to ${section} haven't been saved.`,
};

const INHERITED = 'Inherited from org';

// How org and site values combine for a section.
export const INHERITANCE = {
  settingsAtSite: 'Site values override the org defaults.',
  settingsAtOrg: 'Sites inherit these defaults.',
  rowsAtSite: 'Org items are inherited; a site item with the same title replaces it.',
  rowsAtOrg: 'Sites inherit these items.',
  inheritFromOrg: 'Inherit from org',
  notSet: 'Not set',
  inheritedPill: INHERITED,
  overridesPill: 'Overrides org',
  requiredPill: 'Required',
  inheritedValue: (value) => html`${INHERITED}: ${code(value)}`,
  orgDefault: (value) => html`Org default: ${code(value)}`,
};

export const ROWS = {
  empty: (noun) => `No ${noun}s yet`,
  emptyHint: (noun) => `Add ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} to get started.`,
  duplicate: (noun, column) => `Another ${noun} already uses this ${column.toLowerCase()}.`,
  alreadyListed: (noun) => `This ${noun} is already listed.`,
};

// Content files (library lists, the translate sheet).
export const FILES = {
  loading: (name) => (name ? `Loading ${name}…` : 'Loading…'),
  loadFailed: (path) => html`Could not load ${code(path)}`,
  missing: (path) => html`${code(path)} doesn't exist yet. Saving creates it.`,
  needsPublish: 'Authors see changes once the sheet is previewed and published.',
  unregistered: (name, setup) => html`No ${name} library is set up for this site. ${setup}`,
  external: (title, registered) => html`${title} come from ${code(registered)},
    which isn't a file of this site, so they can't be edited here.`,
  setupOne: (path) => html`Setting it up registers ${code(path)} in the site config and creates
    it if it doesn't exist.`,
  setupFallbacks: (first, fallbacks) => html`Setting it up registers ${code(first)}, or
    ${fallbacks.map((path) => html`${code(path)} `)}if only that exists, in the site config.
    When neither exists, it creates ${code(first)}.`,
};

export const SETUP = {
  experienceWorkspace: 'Experience Workspace isn\'t enabled for this site yet. The setup app turns '
    + 'it on and points Sidekick to the new editor.',
  experienceWorkspaceRerun: 'Sidekick still opening the old editor?',
};

export const VALIDATION = {
  required: (label) => `${label} is required.`,
  enterColumn: (label) => `Enter the ${label.toLowerCase()}.`,
  title: 'Enter a title.',
  key: 'Enter a key.',
  value: 'Enter a value.',
  name: 'Enter a name.',
  urlOrPath: (example) => `Enter a URL or a site path${example ? `, e.g. ${example}` : ''}.`,
  https: 'Enter an https:// URL.',
  icon: 'Enter a URL, a site path or an SVG symbol (#id).',
  ref: (example) => `Use a single ref name, e.g. ${example}.`,

  aemAssets: {
    repositoryId: 'Use author-p<id>-e<id>.adobeaemcloud.com or delivery-p<id>-e<id>.adobeaemcloud.com.',
    hostOnly: 'Enter the host only, without https://.',
    host: 'Enter a valid host, e.g. assets.example.com.',
    pathOnly: 'Enter a path only, e.g. /adobe/assets.',
    mimeRenditions: 'Use mimetype:rendition pairs with avif, play or original, e.g. image/*:avif, '
      + 'video/*:original.',
  },
  apps: { url: 'Enter the app URL.' },
  plugins: {
    reserved: 'This name is reserved for a Library panel.',
    url: 'Enter the plugin URL.',
    urls: 'Enter URLs or site paths, separated by commas.',
  },
  prepare: { urlOrBuiltIn: (builtIns) => `Enter the plugin URL, or use a built-in title: ${builtIns.join(', ')}.` },
  library: {
    blockName: 'Enter the block name.',
    blockUrl: 'Enter the block document URL.',
    templateName: 'Enter a template name.',
    templateUrl: 'Enter the template document URL.',
    iconKey: 'Enter the icon key.',
    iconKeyChars: 'Use letters, numbers, - and _ only.',
  },
  msm: {
    baseSite: 'Enter the base site.',
    siteName: 'Use the site name, e.g. my-site.',
    ownSatellite: 'A site cannot be its own satellite.',
    satelliteTaken: 'This site is already a satellite of another base.',
    duplicate: 'This base and satellite are already listed.',
  },
  translation: {
    credentialsUrl: 'Enter the https:// Admin API source URL.',
    settingsKey: 'This key is edited under Settings.',
    languageCode: 'Enter a language code, e.g. de.',
    folder: 'Enter the folder.',
    folderExample: (example) => `Enter a folder, e.g. ${example}.`,
    actions: 'Use Translate, Copy or Rollout, comma-separated.',
    selfDependency: 'A language cannot depend on itself.',
    otherLanguage: 'Enter the name of another language.',
  },
};

export const IMPORT = {
  repo: 'Enter a GitHub repository, e.g. https://github.com/org/repo.',
  access: {
    'needs-token': 'GitHub could not open this repository. If it is private, add a token.',
    'not-found': 'Repository not found. Check the URL, branch and token.',
    'rate-limit': 'GitHub rate limit reached. Add a token or try again later.',
  },
  readRepoFailed: (result) => failure('read the repository', result),
  noFolders: 'No blocks/ folders found in this repository.',
  pages: 'Enter page paths of this site, one per line, e.g. /index.',
  noPages: 'None of these pages could be read.',
  noBlocks: 'No blocks found on these pages.',
  looking: 'Looking for blocks…',
  reading: (page, index, total) => `Reading ${page} (${index}/${total})…`,
  creating: (name, index, total) => `Creating ${name} (${index}/${total})…`,
  updatingList: 'Updating the blocks list…',
  // `list` only when the documents were also added to the blocks list.
  created: (count, folder, list) => html`Created ${plural(count, 'block document')} in
    ${code(folder)}${list ? html` and added them to ${code(list)}` : ''}.`,
  createFailed: (names) => `Could not create: ${names.join(', ')}.`,
  listFailed: (result) => failure('update the blocks list', result),
};
