// Translation sheet `{org}/{site}/.da/translate`. Each part edits one tab (see the store in
// sections.js); the `config` tab is split between the documented settings and free-form
// service options.

import { all, validator, required } from '../editors/validators.js';
import { ROWS, VALIDATION } from '../messages.js';

const SECRET = /secret|password|token/i;
const ACTIONS = ['translate', 'copy', 'rollout'];

const conflict = (key, label, hint) => ({
  key,
  label,
  hint,
  emptyLabel: 'Default (overwrite, then merge)',
  options: [
    { value: 'overwrite, merge', label: 'Overwrite, then merge' },
    { value: 'merge, overwrite', label: 'Merge, then overwrite' },
    { value: 'overwrite', label: 'Overwrite only' },
    { value: 'merge', label: 'Merge only' },
  ],
});

const onOff = (key, label, hint, value) => ({ key, label, hint, emptyLabel: 'Off', options: [{ value, label: 'On' }] });

const settingsFields = [
  {
    key: 'translation.service.name',
    label: 'Translation service',
    hint: 'Connector used to send and retrieve content.',
    emptyLabel: 'Google (default)',
    options: ['Google', 'Lionbridge', 'Smartling', 'Trados'].map((value) => ({ value, label: value })),
  },
  {
    key: 'translation.service.all.env',
    label: 'Environments',
    hint: 'Comma-separated environments shown in project options. The first is the default.',
    placeholder: 'stage, prod',
  },
  {
    key: 'translation.service.key.path',
    label: 'Credentials sheet',
    hint: 'Admin API source URL of a separate sheet holding the service credentials.',
    placeholder: 'https://admin.da.live/source/org/site/.da/translate-keys.json',
    validate: (value) => !/^https:\/\//.test(value) && VALIDATION.translation.credentialsUrl,
  },
  {
    key: 'source.language',
    label: 'Source language',
    hint: 'Name of the language treated as the source of truth. It must match a row in Languages.',
    placeholder: 'English',
  },
  onOff('source.language.detect', 'Detect source language', 'Take each project\'s source language from the folder its URLs live in.', 'true'),
  conflict('sync.conflict.behavior', 'Sync conflicts', 'When sources are synced to the translation source folder.'),
  conflict('translate.conflict.behavior', 'Translate conflicts', 'When translated content returns from the service.'),
  conflict('copy.conflict.behavior', 'Copy conflicts', 'When a source is copied into a region.'),
  conflict('rollout.conflict.behavior', 'Rollout conflicts', 'When content is rolled out to a locale.'),
  onOff('complete.aem.preview', 'Preview when complete', 'Preview completed documents unless merge conflicts exist.', 'on'),
  onOff('complete.aem.publish', 'Publish when complete', 'Publish completed documents unless merge conflicts exist.', 'on'),
  onOff('translation.service.supports.duedate', 'Due date', 'Show a due-date option in project options.', 'yes'),
];

const SETTING_KEYS = new Set(settingsFields.map((field) => field.key));

const settings = {
  id: 'settings',
  name: 'Settings',
  kind: 'settings',
  description: 'Choose the translation service and how projects handle sources, conflicts and completion.',
  fields: settingsFields,
};

// Endpoints and links (e.g. translation.service.prod.origin / .link / .authEndpoint) are called by
// the Translate app or shown to authors as links, so they must be https URLs.
const URL_KEY = /\.(origin|link|[a-z]*endpoint)$/i;

export const validateOption = validator({
  key: all(
    required(VALIDATION.key),
    (value) => SETTING_KEYS.has(value) && VALIDATION.translation.settingsKey,
  ),
  value: all(
    required(VALIDATION.value),
    (value, row) => URL_KEY.test(row.key ?? '') && !/^https:\/\/[^\s"'<>]+$/.test(value)
      && VALIDATION.https,
  ),
});

const options = {
  id: 'options',
  name: 'Service options',
  kind: 'rows',
  owns: (row) => !SETTING_KEYS.has(row.key),
  idKey: 'key',
  noun: 'option',
  details: (row) => (SECRET.test(row.key) ? '••••••••' : row.value),
  description: 'Endpoints, credentials and custom project fields of the service, e.g. '
    + 'translation.service.prod.origin. Keep secrets in a separate credentials sheet where access matters.',
  validate: validateOption,
  columns: [
    { key: 'key', label: 'Key', required: true, placeholder: 'translation.service.prod.origin' },
    { key: 'value', label: 'Value', required: true, placeholder: 'https://translate.da.live/google' },
  ],
};

const folder = (example) => (value) => value && !value.startsWith('/')
  && VALIDATION.translation.folderExample(example);

export const validateLanguage = validator({
  name: required(VALIDATION.name),
  code: required(VALIDATION.translation.languageCode),
  location: all(required(VALIDATION.translation.folder), folder('/de')),
  actions: (value) => value && value.split(',').map((a) => a.trim().toLowerCase())
    .some((action) => !ACTIONS.includes(action)) && VALIDATION.translation.actions,
  source: folder('/en'),
  'source language': (value, row, others) => value
    && (value === row.name ? VALIDATION.translation.selfDependency
      : !others.some((other) => other.name === value) && VALIDATION.translation.otherLanguage),
});

const languages = {
  id: 'languages',
  name: 'Languages',
  kind: 'rows',
  idKey: 'name',
  noun: 'language',
  details: (row) => [row.code, row.location, row.actions].filter(Boolean).join(' · '),
  description: 'Languages and locales projects can translate, copy or roll out to.',
  validate: validateLanguage,
  columns: [
    { key: 'name', label: 'Name', required: true, placeholder: 'German' },
    { key: 'code', label: 'Code', required: true, placeholder: 'de' },
    { key: 'location', label: 'Location', hint: 'Folder containing the language\'s content.', required: true, placeholder: '/de' },
    { key: 'actions', label: 'Actions', hint: 'Comma-separated: Translate, Copy, Rollout.', placeholder: 'Translate, Rollout' },
    { key: 'locales', label: 'Locales', hint: 'Comma-separated locale paths available for rollout.', placeholder: '/de-at, /de-ch' },
    { key: 'default locales', label: 'Default locales', hint: 'Locales selected by default.', placeholder: '/de-at' },
    { key: 'source', label: 'Source', hint: 'Content path override; URLs under it count as already in the source.', placeholder: '/en' },
    { key: 'source language', label: 'Source language', hint: 'Another language this one waits for before translating.', placeholder: 'English' },
    { key: 'trados location', label: 'Trados location', hint: 'Trados target folder.' },
    { key: 'trados project template', label: 'Trados project template', hint: 'Trados project-template ID.' },
  ],
};

// Do-not-translate tabs: plain lists whose rows are identified by all their columns.
const dntPart = ({ id, name, noun, description, columns }) => ({
  id,
  name,
  noun,
  description,
  kind: 'rows',
  idKey: columns[0].key,
  idOf: (row) => columns.map((c) => row[c.key] ?? '').join('\n'),
  duplicate: ROWS.alreadyListed(noun),
  validate: validator(Object.fromEntries(columns.filter((c) => c.required)
    .map((c) => [c.key, required(VALIDATION.enterColumn(c.label))]))),
  columns,
});

const dnt = [
  dntPart({
    id: 'custom-doc-rules',
    name: 'Document block rules',
    noun: 'rule',
    description: 'Rules for what to translate in document blocks, e.g. "dnt col -1" or '
      + '"translate col 2 if col 1 is "title"".',
    columns: [
      { key: 'block', label: 'Block', required: true, placeholder: 'metadata' },
      { key: 'rule', label: 'Rule', required: true, placeholder: 'do-not-translate' },
    ],
  }),
  dntPart({
    id: 'dnt-content-rules',
    name: 'Do-not-translate text',
    noun: 'text',
    description: 'Exact strings left untranslated wherever they appear, such as product names.',
    columns: [{ key: 'content', label: 'Content', required: true, placeholder: 'Product Name' }],
  }),
  dntPart({
    id: 'dnt-sheet-rules',
    name: 'Sheet value rules',
    noun: 'rule',
    description: 'Spreadsheet or JSON values to preserve. Conditions include equals, beginsWith and '
      + 'exists; separate alternatives with ||.',
    columns: [
      { key: 'pattern', label: 'Pattern', required: true, placeholder: 'beginsWith /' },
      { key: 'action', label: 'Action', placeholder: 'dnt' },
    ],
  }),
  dntPart({
    id: 'dnt',
    name: 'Excluded sheets and columns',
    noun: 'exclusion',
    description: 'JSON sheets or named columns excluded from translation. * matches all.',
    columns: [
      { key: 'dnt-sheet', label: 'Sheet', required: true, placeholder: '*' },
      { key: 'dnt-columns', label: 'Columns', placeholder: 'id, url' },
    ],
  }),
];

export default { parts: [settings, options, languages, ...dnt] };
