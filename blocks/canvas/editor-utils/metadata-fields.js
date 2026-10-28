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

const FIELD_TYPES = ['multi', 'json', 'image'];

/** Build metadata field descriptors from the library "options" sheet. */
export function buildMetadataFields(data) {
  return (data || [])
    .filter((row) => row.key && matchesMetadata(row))
    .map((row) => {
      const type = normalize(row.type);
      return {
        key: row.key.trim(),
        label: row.label?.trim() || row.key.trim(),
        type: FIELD_TYPES.includes(type) ? type : 'single',
        values: parseValues(row.values),
      };
    });
}

/** True for empty or parseable JSON. */
export function isValidJson(value) {
  if (!value) return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** Pretty-print JSON for editing; returns the value unchanged if it isn't valid JSON. */
export function formatJsonValue(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

/** Compact JSON to one line for storage; invalid JSON keeps its text, minus line breaks. */
export function compactJsonValue(value) {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value.replace(/\s*\n\s*/g, ' ').trim();
  }
}

const DEFAULT_FIELDS = [
  { key: 'Title', label: 'Title', type: 'single', values: null },
  { key: 'Description', label: 'Description', type: 'single', values: null },
];

function findDocRow(docRows, key) {
  const target = normalize(key);
  return docRows.find((row) => normalize(row.key) === target);
}

// Image fields carry the page image (or null) and use its src as their value. A row that
// holds an image is always an image field, so editing it as text cannot remove the image.
function withDocValue(field, row) {
  if (field.type !== 'image' && !row?.image) return { ...field, value: row?.value ?? '' };
  return { ...field, type: 'image', value: row?.image?.src ?? '', image: row?.image ?? null };
}

/**
 * Fields shown in the panel: the configured fields (or Title/Description when none),
 * plus any other doc rows, with values read from the doc. Only the other doc rows are removable.
 */
export function resolveMetadataFields(docRows, configuredFields) {
  const baseFields = configuredFields?.length ? configuredFields : DEFAULT_FIELDS;
  const visibleFields = baseFields.map((field) => ({
    ...withDocValue(field, findDocRow(docRows || [], field.key)),
    removable: false,
  }));

  const usedKeys = new Set(baseFields.map((field) => normalize(field.key)));
  const extraFields = (docRows || [])
    .filter((row) => !usedKeys.has(normalize(row.key)))
    .map((row) => ({
      ...withDocValue({ key: row.key, label: row.key, type: 'single', values: null }, row),
      removable: true,
    }));

  return [...visibleFields, ...extraFields];
}
