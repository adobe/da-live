// Built-in library types. Each is
// registered by a `library` config row (see sections.js) and lists its items in a content sheet
// of the site, read by the editor (blocks/canvas/ew-panel-extensions) from its first tab.

import { all, validator, required, urlOrPath } from '../editors/validators.js';
import { VALIDATION } from '../messages.js';

function libraryPanel({
  noun, idKey, description, columns, validate, importable = false,
}) {
  return {
    kind: 'rows',
    importable,
    idKey,
    noun,
    description,
    columns,
    validate,
  };
}

export const validateBlock = validator({
  name: required(VALIDATION.library.blockName),
  path: all(required(VALIDATION.library.blockUrl), urlOrPath()),
});

export const validateTemplate = validator({
  key: required(VALIDATION.library.templateName),
  value: all(required(VALIDATION.library.templateUrl), urlOrPath()),
});

export const validateIcon = validator({
  // Inserted as :key:, so it can't contain spaces or colons.
  key: all(
    required(VALIDATION.library.iconKey),
    (value) => !/^[\w-]+$/.test(value) && VALIDATION.library.iconKeyChars,
  ),
  icon: urlOrPath(),
});

export const validatePlaceholder = validator({ Key: required(VALIDATION.key) });

export const blocks = libraryPanel({
  noun: 'block',
  idKey: 'name',
  description: 'Authors can add Blocks to the pages from the Library. Each one points to a document showing the block and its variants.',
  importable: true,
  validate: validateBlock,
  columns: [
    { key: 'name', label: 'Name', hint: 'Shown to authors.', required: true, placeholder: 'Cards' },
    {
      key: 'path',
      label: 'Path',
      hint: 'URL of the block document with its variants.',
      required: true,
      placeholder: 'https://content.da.live/org/site/library/blocks/cards',
    },
  ],
});

export const templates = libraryPanel({
  noun: 'template',
  idKey: 'key',
  description: 'Documents authors can use as a starting point for a new page.',
  validate: validateTemplate,
  columns: [
    { key: 'key', label: 'Name', hint: 'Shown to authors.', required: true, placeholder: 'Article' },
    {
      key: 'value',
      label: 'Path',
      hint: 'URL of the template document.',
      required: true,
      placeholder: 'https://content.da.live/org/site/library/templates/article',
    },
  ],
});

export const icons = libraryPanel({
  noun: 'icon',
  idKey: 'key',
  description: 'Icons authors can add to content. Each one is written into the page as :key:.',
  validate: validateIcon,
  columns: [
    { key: 'key', label: 'Key', hint: 'Inserted as :key:.', required: true, placeholder: 'adobe' },
    { key: 'value', label: 'Label', hint: 'Optional name shown to authors.', placeholder: 'Adobe logo' },
    {
      key: 'icon',
      label: 'Icon',
      hint: 'URL of the SVG.',
      placeholder: 'https://content.da.live/org/site/icons/adobe.svg',
    },
  ],
});

// The site's EDS placeholders sheet: Key + Text columns.
export const placeholders = libraryPanel({
  noun: 'placeholder',
  idKey: 'Key',
  description: 'Reusable text for the site, such as labels and button text. Content and code refer to each entry by its key.',
  validate: validatePlaceholder,
  columns: [
    { key: 'Key', label: 'Key', hint: 'Identifier used in content and code.', required: true, placeholder: 'read-more' },
    { key: 'Text', label: 'Text', hint: 'The text for this key.', placeholder: 'Read more', multiline: true },
  ],
});
