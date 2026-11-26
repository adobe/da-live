// Built-in library types. Each is
// registered by a `library` config row (see sections.js) and lists its items in a content sheet
// of the site, read by the editor (blocks/canvas/ew-panel-extensions) from its first tab.

import { html, nothing, repeat } from 'da-lit';
import { ensurePreviewProxySession, toPreviewProxyUrl } from '../../shared/preview-proxy.js';
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

function iconPreview(row, { org, site }) {
  const value = String(row.icon ?? '').trim();
  if (!value) return nothing;
  const src = toPreviewProxyUrl(value, { org, site, currentOrg: org });
  return repeat([src], (url) => url, (url) => html`
    <span class="config-icon-preview">
      <img src=${url} alt="" width="24" height="24"
        @error=${async ({ target }) => {
    target.hidden = true;
    target.nextElementSibling.hidden = false;
    if (target.dataset.retried) return;
    target.dataset.retried = 'true';
    const ready = await ensurePreviewProxySession(url, { org, site, currentOrg: org });
    if (ready) {
      target.hidden = false;
      target.nextElementSibling.hidden = true;
      target.src = url;
    }
  }}>
      <span class="config-icon-unavailable" hidden>Preview unavailable</span>
    </span>
  `);
}

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
    {
      key: 'key', label: 'Key', hint: 'Inserted as :key:.', required: true, placeholder: 'adobe', preview: iconPreview,
    },
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
