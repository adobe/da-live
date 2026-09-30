import { isColorCode } from './color-code.js';

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
  { key: 'Title', label: 'Title', type: 'single', values: null, removable: true },
  { key: 'Description', label: 'Description', type: 'single', values: null, removable: true },
];

function findDocValue(docRows, key) {
  const target = normalize(key);
  return docRows.find((row) => normalize(row.key) === target)?.value ?? '';
}

/**
 * Resolve the metadata fields shown in the panel. When the library config defines
 * metadata fields, use that configured field list; otherwise fall back to the built-in
 * Title/Description fields. In both cases, keep any additional doc-only metadata rows
 * visible as removable plain-text fields, and hydrate everything from the live doc
 * case-insensitively. Deleting a fallback/configured field only removes the current
 * metadata row; the field stays visible because it remains part of the resolved base set.
 */
export function resolveMetadataFields(docRows, configuredFields) {
  const hasConfig = !!configuredFields?.length;
  const baseFields = hasConfig ? configuredFields : DEFAULT_FIELDS;
  const visibleFields = baseFields.map((field) => ({
    ...field,
    value: findDocValue(docRows, field.key),
    configured: true,
    removable: true,
  }));

  const usedKeys = new Set(baseFields.map((field) => normalize(field.key)));
  const extraFields = (docRows || [])
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

  return [...visibleFields, ...extraFields];
}
