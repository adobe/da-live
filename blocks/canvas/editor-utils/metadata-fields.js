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
    .map((row) => {
      const rawLabel = row.label?.trim() || undefined;
      return {
        key: row.key.trim(),
        label: rawLabel || row.key.trim(),
        rawLabel,
        type: normalize(row.type) === 'multi' ? 'multi' : 'single',
        values: parseValues(row.values),
      };
    });
}

const DEFAULT_FIELDS = [
  { key: 'Title', label: 'Title', type: 'single', values: null, removable: false },
  { key: 'Description', label: 'Description', type: 'single', values: null, removable: false },
];

function findDocValue(docRows, key) {
  const target = normalize(key);
  return docRows.find((row) => normalize(row.key) === target)?.value ?? '';
}

function findConfigRawLabel(configuredFields, key) {
  const target = normalize(key);
  return configuredFields.find((f) => normalize(f.key) === target)?.rawLabel;
}

/**
 * Merge the page's current metadata rows with the configured field set. Title and
 * Description always come first (as plain text, regardless of what config says about
 * their type/values), using the config's label for them when one is explicitly given.
 * Configured fields follow, then any doc key not covered by Title/Description/config so
 * existing data is never dropped.
 */
export function mergeMetadataFields(docRows, configuredFields) {
  const titleDescFields = DEFAULT_FIELDS.map((f) => ({
    ...f,
    label: findConfigRawLabel(configuredFields, f.key) || f.label,
    value: findDocValue(docRows, f.key),
    configured: true,
  }));

  const restConfigured = configuredFields.filter(
    (f) => !DEFAULT_FIELDS.some((d) => normalize(d.key) === normalize(f.key)),
  );
  const merged = restConfigured.map((f) => (
    { ...f, value: findDocValue(docRows, f.key), configured: true, removable: true }
  ));

  const usedKeys = new Set([
    ...DEFAULT_FIELDS.map((f) => normalize(f.key)),
    ...restConfigured.map((f) => normalize(f.key)),
  ]);
  const extra = docRows
    .filter((row) => !usedKeys.has(normalize(row.key)))
    .map((row) => ({
      key: row.key,
      label: row.key,
      type: 'single',
      values: null,
      value: row.value,
      configured: false,
      removable: true,
    }));

  return [...titleDescFields, ...merged, ...extra];
}
