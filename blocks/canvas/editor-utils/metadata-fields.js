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

/** Build metadata field descriptors from the library "options" sheet. */
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
 * Fields shown in the panel: the configured fields (or Title/Description when none),
 * plus any other doc rows, with values read from the doc.
 */
export function resolveMetadataFields(docRows, configuredFields) {
  const baseFields = configuredFields?.length ? configuredFields : DEFAULT_FIELDS;
  const visibleFields = baseFields.map((field) => ({
    ...field,
    value: findDocValue(docRows, field.key),
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
    }));

  return [...visibleFields, ...extraFields];
}
