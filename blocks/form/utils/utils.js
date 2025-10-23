import { daFetch } from '../../shared/utils.js';
import HTMLToJSON from './converters.js';

export async function convertHtmlToJson(html) {
  const { json } = new HTMLToJSON(html);
  return json;
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
  if (currentSchema?.title) return currentSchema.title;

  // Otherwise, check if there's a $ref and resolve it
  if (currentSchema?.$ref) {
    const resolved = resolveRef(schema, currentSchema.$ref);
    return resolved?.title;
  }

  return null;
}

export function annotateWithSchema(data, schema) {
  // Handle arrays
  if (Array.isArray(data)) {
    const itemSchema = schema.items || {};
    return data.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return {
          value: annotateWithSchema(item, itemSchema),
          schema: itemSchema,
        };
      }
      return { value: item, schema: itemSchema };
    });
  }

  // Handle objects
  const annotated = {};

  for (const [key, value] of Object.entries(data)) {
    const propertySchema = schema.properties?.[key] || {};

    // Check if we should recurse
    if (value !== null && typeof value === 'object') {
      if (Array.isArray(value)) {
        // Handle array values
        annotated[key] = {
          value: annotateWithSchema(value, propertySchema),
          schema: propertySchema,
        };
      } else if (propertySchema.type === 'object' || propertySchema.properties) {
        // Handle object values
        annotated[key] = {
          value: annotateWithSchema(value, propertySchema),
          schema: propertySchema,
        };
      } else {
        // Object but schema doesn't specify - still wrap it
        annotated[key] = { value, schema: propertySchema };
      }
    } else {
      // Primitive values
      annotated[key] = { value, schema: propertySchema };
    }
  }

  return annotated;
}

export function deReference(schema) {
  const defs = schema.$defs || {};
  const seen = new WeakMap(); // Cache to prevent infinite recursion

  function resolveRefSm(ref) {
    const path = ref.replace('#/$defs/', '');
    return defs[path];
  }

  function deref(obj, visiting = new WeakSet()) {
    // Base case: not an object
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map((item) => deref(item, visiting));
    }

    // Check cache first
    if (seen.has(obj)) {
      return seen.get(obj);
    }

    // Cycle detection
    if (visiting.has(obj)) {
      return { ...obj }; // Return shallow copy to break cycle
    }

    visiting.add(obj);

    // Handle $ref - DON'T recursively process yet, just get the definition
    let resolved;
    if (obj.$ref) {
      const refDef = resolveRefSm(obj.$ref);
      if (refDef) {
        // Merge the definition with local properties (local props override)
        // Don't include $ref in the result
        const { $ref, ...localProps } = obj;
        resolved = { ...refDef, ...localProps };
      } else {
        // If ref not found, use obj without $ref
        const { $ref, ...rest } = obj;
        resolved = rest;
      }
    } else {
      // No $ref, just copy the object
      resolved = { ...obj };
    }

    // Now recursively process the merged result
    // Recursively process properties
    if (resolved.properties) {
      const newProps = {};
      for (const [key, val] of Object.entries(resolved.properties)) {
        newProps[key] = deref(val, visiting);
      }
      resolved.properties = newProps;
    }

    // Recursively process items (for arrays)
    if (resolved.items) {
      resolved.items = deref(resolved.items, visiting);
    }

    // Recursively process oneOf
    if (resolved.oneOf) {
      resolved.oneOf = resolved.oneOf.map((item) => deref(item, visiting));
    }

    // Recursively process anyOf
    if (resolved.anyOf) {
      resolved.anyOf = resolved.anyOf.map((item) => deref(item, visiting));
    }

    // Recursively process allOf
    if (resolved.allOf) {
      resolved.allOf = resolved.allOf.map((item) => deref(item, visiting));
    }

    // Cache the result
    seen.set(obj, resolved);

    return resolved;
  }

  return deref(schema);
}
