/**
 * Generate an object with empty values from a JSON Schema
 * @param {object} schema - JSON Schema (draft 2020-12)
 * @param {Set} requiredFields - Set of required field names (used internally)
 * @returns {object} - Object with empty values
 */
export default function generateEmptyObject(schema, requiredFields = new Set()) {
  // Handle $ref references
  if (schema.$ref) {
    const refPath = schema.$ref.split('/').slice(1); // Remove leading #
    let resolved = schema;
    for (const part of refPath) {
      resolved = resolved[part];
    }
    return generateEmptyObject(resolved, requiredFields);
  }

  // Handle oneOf - take the first option
  if (schema.oneOf) {
    return generateEmptyObject(schema.oneOf[0], requiredFields);
  }

  // If field has enum values, return the first one if it's required
  if (schema.enum && schema.enum.length > 0 && requiredFields.size > 0) {
    return schema.enum[0];
  }

  const { type } = schema;

  switch (type) {
    case 'object': {
      const obj = {};
      if (schema.properties) {
        // Create a set of required fields for child properties
        const childRequired = new Set(schema.required || []);

        for (const [key, propSchema] of Object.entries(schema.properties)) {
          // Pass down whether this specific field is required
          const isRequired = childRequired.has(key);
          obj[key] = generateEmptyObject(propSchema, isRequired ? new Set([key]) : new Set());
        }
      }
      return obj;
    }

    case 'array': {
      // If array items have enum and array is required, include first item
      if (schema.items?.enum && requiredFields.size > 0) {
        return [schema.items.enum[0]];
      }
      return [];
    }

    case 'string':
      return schema.enum && schema.enum.length > 0 ? schema.enum[0] : '';

    case 'number':
    case 'integer':
      return schema.enum && schema.enum.length > 0 ? schema.enum[0] : 0;

    case 'boolean':
      return schema.enum && schema.enum.length > 0 ? schema.enum[0] : false;

    case 'null':
      return null;

    default:
      return null;
  }
}
