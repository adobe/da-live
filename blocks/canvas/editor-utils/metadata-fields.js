import { isColorCode } from '../ew-editor-doc/slash-menu/block-options.js';

const BLOCKS_FILTER = 'metadata';

function normalize(str) {
  return (str || '').toLowerCase().trim();
}

function matchesMetadata(row) {
  return (row.blocks || '').split(',').some((b) => normalize(b) === BLOCKS_FILTER);
}

function parseValues(raw) {
  if (!raw) return null;
  return raw.split('|').map((v) => {
    const [label, val] = v.split('=').map((s) => s.trim());
    const value = val || label;
    return { title: label, value, ...(isColorCode(value) ? { colorValue: value } : {}) };
  });
}

/**
 * Filter the library "options" sheet (columns: blocks, key, values, type, label) to the
 * rows configuring the page metadata panel, producing one field descriptor per key.
 */
export function buildMetadataFields(data) {
  return (data || [])
    .filter((row) => row.key && matchesMetadata(row))
    .map((row) => ({
      key: row.key.trim(),
      label: row.label?.trim() || row.key.trim(),
      type: normalize(row.type) === 'multi' ? 'multi' : 'single',
      values: parseValues(row.values),
    }));
}

const DEFAULT_FIELDS = [
  { key: 'Title', label: 'Title', type: 'single', values: null },
  { key: 'Description', label: 'Description', type: 'single', values: null },
];

function findDocValue(docRows, key) {
  const target = normalize(key);
  return docRows.find((row) => normalize(row.key) === target)?.value ?? '';
}

/**
 * Merge the page's current metadata rows with the configured field set: configured (or,
 * absent config, the default Title/Description) fields first, pre-filled from the doc,
 * followed by any doc key not covered by config so existing data is never dropped.
 */
export function mergeMetadataFields(docRows, configuredFields) {
  const fields = configuredFields.length ? configuredFields : DEFAULT_FIELDS;
  const usedKeys = new Set(fields.map((f) => normalize(f.key)));

  const merged = fields.map((f) => (
    { ...f, value: findDocValue(docRows, f.key), configured: true }
  ));
  const extra = docRows
    .filter((row) => !usedKeys.has(normalize(row.key)))
    .map((row) => ({
      key: row.key, label: row.key, type: 'single', values: null, value: row.value, configured: false,
    }));

  return [...merged, ...extra];
}
