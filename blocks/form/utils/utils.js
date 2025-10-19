import { daFetch } from '../../shared/utils.js';
import HTMLToJSON from './converters.js';

export async function convertHtmlToJson(html) {
  const { json } = new HTMLToJSON(html);
  return json;
}

export function convertJson2Html(doc) {
  console.log(doc);
}

export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}

// Helper to resolve $ref paths in the schema
export function resolveRef(schema, ref) {
  if (!ref || !ref.startsWith('#/')) return null;

  const path = ref.substring(2).split('/'); // Remove '#/' and split
  let current = schema;

  for (const segment of path) {
    current = current[segment];
    if (!current) return null;
  }

  return current;
}

// Get the title for an array's items from the schema
export function getArrayItemTitle(schema, currentSchema) {
  if (!currentSchema?.items) return null;

  // If there's a title directly on the array property, use it
  if (currentSchema.title) {
    return currentSchema.title;
  }

  // Handle direct $ref in items
  if (currentSchema.items.$ref) {
    const resolved = resolveRef(schema, currentSchema.items.$ref);
    return resolved?.title;
  }

  // Handle oneOf with $ref
  if (currentSchema.items.oneOf) {
    const refs = currentSchema.items.oneOf
      .filter((item) => item.$ref)
      .map((item) => resolveRef(schema, item.$ref)?.title)
      .filter(Boolean);
    return refs.length > 0 ? refs.join(' or ') : null;
  }

  return currentSchema.items.title;
}

// Get the title for an object from the schema
export function getObjectTitle(schema, currentSchema) {
  // If there's a title directly on currentSchema, use it (even if there's also a $ref)
  if (currentSchema?.title) {
    return currentSchema.title;
  }

  // Otherwise, check if there's a $ref and resolve it
  if (currentSchema?.$ref) {
    const resolved = resolveRef(schema, currentSchema.$ref);
    return resolved?.title;
  }

  return null;
}
