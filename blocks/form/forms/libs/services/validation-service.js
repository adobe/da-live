/**
 * ValidationService
 *
 * Pure JSON Schema validation helpers with no DOM access.
 */
export class ValidationService {
  /** 
   * Return a validation error string or null for a single field value.
   *
   * @param {*} value
   * @param {object} schema
   * @param {{ required?: boolean }} opts
   * @returns {string|null}
   */
  getValidationError(value, schema = {}, { required = false } = {}) {
    const isEmpty = (v) => v === '' || v === null || v === undefined;
    if (required && isEmpty(value)) return 'This field is required.';
    if (isEmpty(value)) return null;

    // Type validations
    if (schema.type === 'number' || schema.type === 'integer') {
      const num = Number(value);
      if (Number.isNaN(num)) return 'Please enter a valid number.';
      if (schema.type === 'integer' && !Number.isInteger(num)) return 'Please enter a whole number.';
      if (typeof schema.minimum === 'number' && num < schema.minimum) return `Must be at least ${schema.minimum}.`;
      if (typeof schema.maximum === 'number' && num > schema.maximum) return `Must be at most ${schema.maximum}.`;
    }

    if (schema.type === 'string') {
      if (typeof schema.minLength === 'number' && String(value).length < schema.minLength) {
        return `Must be at least ${schema.minLength} characters.`;
      }
      if (typeof schema.maxLength === 'number' && String(value).length > schema.maxLength) {
        return `Must be at most ${schema.maxLength} characters.`;
      }
      if (schema.pattern) {
        try {
          const re = new RegExp(schema.pattern);
          if (!re.test(String(value))) return 'Invalid format.';
        } catch {}
      }
      if (schema.format === 'email') {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(String(value))) return 'Please enter a valid email address.';
      }
      if (schema.format === 'uri' || schema.format === 'url') {
        try { new URL(String(value)); } catch { return 'Please enter a valid URL.'; }
      }
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      if (!schema.enum.includes(value)) return 'Invalid value.';
    }

    return null;
  }

  /**
   * Return dotted paths of required arrays-of-objects that are empty.
   *
   * @param {object} schema
   * @param {object} data
   * @param {(node:object)=>object} normalize - function to deref/normalize a node
   * @param {(data:object, path:string)=>any} getValue - function to read a dotted path from data
   * @returns {string[]} paths
   */
  getEmptyRequiredArrayPaths(schema, data, { normalize, getValue }) {
    const out = [];
    const norm = (n) => normalize(n) || n || {};
    const walk = (node, pathPrefix = '') => {
      const n = norm(node);
      if (!n || n.type !== 'object' || !n.properties) return;
      const requiredSet = new Set(n.required || []);
      Object.entries(n.properties).forEach(([key, child]) => {
        const childNorm = norm(child);
        const propPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const isRequired = requiredSet.has(key);
        const isArrayOfObjects = childNorm && childNorm.type === 'array' && (
          (childNorm.items && (childNorm.items.type === 'object' || childNorm.items.properties)) || !!childNorm.items?.$ref
        );
        if (isRequired && isArrayOfObjects) {
          const val = getValue(data, propPath);
          if (!Array.isArray(val) || val.length === 0) out.push(propPath);
        }
        if (childNorm && childNorm.type === 'object' && childNorm.properties) {
          walk(childNorm, propPath);
        }
      });
    };
    walk(schema, '');
    return out;
  }
}

export default ValidationService;


