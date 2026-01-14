import { daFetch } from '../../shared/utils.js';

export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}

/**
 * Sets a value on an object using a path string.
 * Supports dot notation and array indices.
 * @param {Object} obj - The object to set the value on
 * @param {string} path - The path string (e.g., "data.parent[0].child")
 * @param {*} value - The value to set
 * @example
 * const obj = { data: { items: [{ name: 'test' }] } };
 * setValueByPath(obj, 'data.items[0].name', 'updated');
 * // obj.data.items[0].name is now 'updated'
 */
export function setValueByPath(obj, path, value) {
  // Split the path into parts, handling both dots and brackets
  const parts = path.split('.').flatMap((part) => {
    // Handle array indices like "items[0]" -> ["items", "0"]
    const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
    if (arrayMatch) {
      return [arrayMatch[1], parseInt(arrayMatch[2], 10)];
    }
    // Handle standalone array index like "[0]"
    const indexMatch = part.match(/^\[(\d+)\]$/);
    if (indexMatch) {
      return [parseInt(indexMatch[1], 10)];
    }
    return part;
  });

  // Navigate to the parent of the final property
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!(part in current)) {
      // Create missing intermediate objects/arrays
      const nextPart = parts[i + 1];
      current[part] = typeof nextPart === 'number' ? [] : {};
    }
    current = current[part];
  }

  // Set the final value
  current[parts[parts.length - 1]] = value;
}

function resolvePropSchema(key, localSchema, fullSchema) {
  const { title } = localSchema;

  if (localSchema.$ref) {
    const path = localSchema.$ref.substring(2).split('/')[1];

    // try local ref
    let def = localSchema.$defs?.[path];
    // TODO: walk up the tree looking for the def
    // try global ref
    if (!def) def = fullSchema.$defs?.[path];
    if (def) {
      if (!title) return def;
      return { ...def, title };
    }
  }

  // Normalize local props to the same format as referenced schema
  return { title, properties: localSchema };
}

/**
 * @param {*} key the key of the property
 * @param {*} prop the current property being acted on
 * @param {*} propSchema the schema that applies to the current property
 * @param {*} fullSchema the full schema that applies to the form
 * @param {*} path the full path to this property (e.g., "grand.parent[0].child")
 */
export function annotateProp(key, propData, propSchema, fullSchema, path = '') {
  // Build the current path
  const currentPath = path ? `${path}.${key}` : key;

  // Will have schema.props
  const resolvedSchema = resolvePropSchema(key, propSchema, fullSchema);

  if (Array.isArray(propData)) {
    const resolvedItemsSchema = resolvePropSchema(key, propSchema.items, fullSchema);

    // It's possible that items do not have a title, let them inherit from the parent
    resolvedItemsSchema.title ??= resolvedSchema.title;

    const data = [];

    // Loop through the actual data and match it to the item schema
    propData.forEach((itemPropData, index) => {
      if (propSchema.items.oneOf) {
        // TODO: Support one of schemas
        // propSchema.items.oneOf.forEach((oneOf) => {
        //   console.log(oneOf);
        //   const arrayPath = `${currentPath}[${index}]`;
        //   data.push(annotateProp(key, itemPropData, oneOf, fullSchema, arrayPath));
        // });
      } else {
        data.push(annotateProp(`[${index}]`, itemPropData, propSchema.items, fullSchema, currentPath));
      }
    });

    return { key, data, schema: resolvedSchema, path: currentPath };
  }

  if (typeof propData === 'object') {
    // Loop through the data and match it to the item schema
    // return as array to keep consistent with upper array
    const data = Object.entries(propData).reduce((acc, [k, pD]) => {
      if (resolvedSchema.properties[k]) {
        acc.push(annotateProp(k, pD, resolvedSchema.properties[k], fullSchema, currentPath));
      }

      // Look for sub-property schemas
      if (resolvedSchema.properties.properties?.[k]) {
        const subPropSchema = resolvedSchema.properties.properties[k];
        acc.push(annotateProp(k, pD, subPropSchema, fullSchema, currentPath));
      }

      return acc;
    }, []);

    return { key, data, schema: resolvedSchema, path: currentPath };
  }

  return { key, data: propData, schema: resolvedSchema, path: currentPath };
}
