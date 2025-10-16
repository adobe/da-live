/**
 * FormDataModel
 *
 * Pure data helpers used by the generator. Provides utilities for:
 * - Generating base JSON structures (dense or sparse) from schema
 * - Resolving schema nodes by path
 * - Getting/setting nested values and coercing input values
 * - Array mutations (push/remove/reorder) and pruning helpers
 */
export default class FormDataModel {
  /**
   * @param {object} context - Shared services context
   * @param {object} schema - Root JSON Schema
   */
  constructor(context, schema) {
    this.context = context;
    this.schemaService = context.services.schema;
    this.schema = schema;
  }

  /** Generate a full base JSON object from `schema`, following defaults. */
  generateBaseJSON(schema = this.schema, seenRefs = new Set()) {
    const rootSchema = this.schema;
    const normalize = (node) => {
      if (this.schemaService) return this.schemaService.normalizeSchema(rootSchema, node);
      if (!node || typeof node !== 'object') return node;
      const out = { ...node };
      if (Array.isArray(out.type)) {
        const primary = out.type.find((t) => t !== 'null') || out.type[0];
        out.type = primary;
      }
      return out;
    };
    const deref = (node) => (this.schemaService ? this.schemaService.derefNode(rootSchema, node) : node);
    const normalizedRoot = normalize(schema) || schema;
    if (!normalizedRoot || normalizedRoot.type !== 'object' || !normalizedRoot.properties) return {};
    const baseData = {};
    Object.entries(normalizedRoot.properties).forEach(([key, originalPropSchema]) => {
      const effective = normalize(deref(originalPropSchema) || originalPropSchema) || originalPropSchema;
      const refStr = originalPropSchema && originalPropSchema.$ref ? String(originalPropSchema.$ref) : null;
      if (refStr) {
        if (seenRefs.has(refStr)) return;
        seenRefs.add(refStr);
      }
      const type = Array.isArray(effective?.type)
        ? (effective.type.find((t) => t !== 'null') || effective.type[0])
        : effective?.type;
      switch (type) {
        case 'string':
          baseData[key] = effective.default || '';
          break;
        case 'number':
        case 'integer':
          baseData[key] = (Object.prototype.hasOwnProperty.call(effective, 'default') ? effective.default : null);
          break;
        case 'boolean':
          baseData[key] = effective.default || false;
          break;
        case 'array':
          baseData[key] = Array.isArray(effective.default) ? effective.default : [];
          break;
        case 'object':
          baseData[key] = this.generateBaseJSON(effective, seenRefs);
          break;
        default: {
          if (effective && typeof effective === 'object' && effective.properties) {
            baseData[key] = this.generateBaseJSON(effective, seenRefs);
          } else if (effective && effective.enum) {
            baseData[key] = effective.default || '';
          } else {
            baseData[key] = effective && Object.prototype.hasOwnProperty.call(effective, 'default') ? effective.default : null;
          }
        }
      }
      if (refStr) seenRefs.delete(refStr);
    });
    return baseData;
  }

  /** Generate a minimal base JSON object including only required branches. */
  generateSparseBaseJSON(schema = this.schema, seenRefs = new Set()) {
    const rootSchema = this.schema;
    const normalize = (node) => {
      if (this.schemaService) return this.schemaService.normalizeSchema(rootSchema, node);
      if (!node || typeof node !== 'object') return node;
      const out = { ...node };
      if (Array.isArray(out.type)) {
        const primary = out.type.find((t) => t !== 'null') || out.type[0];
        out.type = primary;
      }
      return out;
    };
    const deref = (node) => (this.schemaService ? this.schemaService.derefNode(rootSchema, node) : node);
    const normalizedRoot = normalize(schema) || schema;
    if (!normalizedRoot || normalizedRoot.type !== 'object' || !normalizedRoot.properties) return {};
    const requiredSet = new Set(Array.isArray(normalizedRoot.required) ? normalizedRoot.required : []);
    const baseData = {};
    Object.entries(normalizedRoot.properties).forEach(([key, originalPropSchema]) => {
      const effective = normalize(deref(originalPropSchema) || originalPropSchema) || originalPropSchema;
      const refStr = originalPropSchema && originalPropSchema.$ref ? String(originalPropSchema.$ref) : null;
      if (refStr) {
        if (seenRefs.has(refStr)) return;
        seenRefs.add(refStr);
      }
      const type = Array.isArray(effective?.type)
        ? (effective.type.find((t) => t !== 'null') || effective.type[0])
        : effective?.type;
      switch (type) {
        case 'string':
          baseData[key] = effective.default || '';
          break;
        case 'number':
        case 'integer':
          baseData[key] = (Object.prototype.hasOwnProperty.call(effective, 'default') ? effective.default : null);
          break;
        case 'boolean':
          baseData[key] = effective.default || false;
          break;
        case 'array':
          baseData[key] = Array.isArray(effective.default) ? effective.default : [];
          break;
        case 'object': {
          const hasProps = !!(effective && effective.properties);
          if (hasProps) {
            if (requiredSet.has(key)) {
              baseData[key] = this.generateSparseBaseJSON(effective, seenRefs);
            }
          } else {
            baseData[key] = {};
          }
          break;
        }
        default: {
          if (effective && typeof effective === 'object' && effective.properties) {
            if (requiredSet.has(key)) baseData[key] = this.generateSparseBaseJSON(effective, seenRefs);
          } else if (effective && effective.enum) {
            baseData[key] = effective.default || '';
          } else {
            baseData[key] = effective && Object.prototype.hasOwnProperty.call(effective, 'default') ? effective.default : null;
          }
        }
      }
      if (refStr) seenRefs.delete(refStr);
    });
    return baseData;
  }

  /** Resolve a schema node via dotted path with optional array indices. */
  resolveSchemaByPath(dottedPath) {
    const tokens = String(dottedPath || '').split('.');
    let current = this.schema;
    for (const token of tokens) {
      const normalized = this.schemaService
        ? this.schemaService.normalizeSchema(this.schema, (this.schemaService.derefNode(this.schema, current) || current))
        : current;
      if (!normalized) return null;
      const match = token.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = match ? match[1] : token;
      current = normalized?.properties?.[key];
      if (!current) return null;
      const idxPresent = match && typeof match[2] !== 'undefined';
      if (idxPresent) {
        const curNorm = this.schemaService
          ? this.schemaService.normalizeSchema(this.schema, (this.schemaService.derefNode(this.schema, current) || current))
          : current;
        if (!curNorm || curNorm.type !== 'array') return null;
        current = this.schemaService
          ? (this.schemaService.derefNode(this.schema, curNorm.items) || curNorm.items)
          : curNorm.items;
        if (!current) return null;
      }
    }
    return current;
  }

  /**
   * Remove empty entries from arrays of primitives throughout `dataObj`,
   * using `schemaNode` to guide traversal.
   */
  prunePrimitiveArrays(schemaNode, pathPrefix = '', dataObj) {
    const s = this.schemaService
      ? this.schemaService.normalizeSchema(this.schema, (this.schemaService.derefNode(this.schema, schemaNode) || schemaNode) || {})
      : schemaNode;
    if (!s) return;
    if (s.type === 'object' && s.properties) {
      Object.entries(s.properties).forEach(([key, child]) => {
        const eff = this.schemaService
          ? this.schemaService.normalizeSchema(this.schema, (this.schemaService.derefNode(this.schema, child) || child) || {})
          : child;
        const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        if (!eff) return;
        if (eff.type === 'array') {
          const itemEff = this.schemaService
            ? this.schemaService.normalizeSchema(this.schema, (this.schemaService.derefNode(this.schema, eff.items) || eff.items) || {})
            : eff.items;
          const dataArr = this.getNestedValue(dataObj, childPath);
          if (Array.isArray(dataArr)) {
            const isObjectItems = !!(itemEff && (itemEff.type === 'object' || itemEff.properties));
            if (isObjectItems) {
              for (let i = 0; i < dataArr.length; i += 1) {
                this.prunePrimitiveArrays(itemEff, `${childPath}[${i}]`, dataObj);
              }
            } else {
              const itemType = itemEff?.type || 'string';
              if (itemType === 'string') {
                const filtered = dataArr.filter((v) => !(v == null || v === ''));
                this.setNestedValue(dataObj, childPath, filtered);
              }
            }
          }
        } else if (eff.type === 'object' || eff.properties) {
          this.prunePrimitiveArrays(eff, childPath, dataObj);
        }
      });
    } else if (s.type === 'array') {
      const itemEff = this.schemaService
        ? this.schemaService.normalizeSchema(this.schema, (this.schemaService.derefNode(this.schema, s.items) || s.items) || {})
        : s.items;
      const dataArr = this.getNestedValue(dataObj, pathPrefix);
      if (Array.isArray(dataArr)) {
        const isObjectItems = !!(itemEff && (itemEff.type === 'object' || itemEff.properties));
        if (isObjectItems) {
          for (let i = 0; i < dataArr.length; i += 1) {
            this.prunePrimitiveArrays(itemEff, `${pathPrefix}[${i}]`, dataObj);
          }
        } else {
          const itemType = itemEff?.type || 'string';
          if (itemType === 'string') {
            const filtered = dataArr.filter((v) => !(v == null || v === ''));
            this.setNestedValue(dataObj, pathPrefix, filtered);
          }
        }
      }
    }
  }

  /** Get a value from an input element with consistent coercion. */
  getInputValue(inputEl) {
    if (!inputEl) return '';
    if (inputEl.type === 'checkbox') return inputEl.checked;
    return inputEl.value ?? '';
  }

  /** Read a nested value using dot/bracket path notation. */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    const tokens = [];
    const regex = /[^.\[\]]+|\[(\d+)\]/g;
    let match;
    while ((match = regex.exec(path)) !== null) {
      if (match[1] !== undefined) tokens.push(Number(match[1]));
      else tokens.push(match[0]);
    }
    let current = obj;
    for (const key of tokens) {
      if (current == null) return undefined;
      current = current[key];
    }
    return current;
  }

  /** Write a nested value using dot/bracket path notation. */
  setNestedValue(obj, path, value) {
    if (!path) return;
    // Support bracket notation for array indices: field[0].sub → ['field', 0, 'sub']
    const tokens = [];
    const regex = /[^.\[\]]+|\[(\d+)\]/g;
    let match;
    while ((match = regex.exec(path)) !== null) {
      if (match[1] !== undefined) {
        tokens.push(Number(match[1]));
      } else {
        tokens.push(match[0]);
      }
    }

    let current = obj;
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const key = tokens[i];
      const nextKey = tokens[i + 1];
      if (typeof key === 'number') {
        if (!Array.isArray(current)) {
          // Convert current to array if not already
          // eslint-disable-next-line no-param-reassign
          current = [];
        }
        if (current[key] == null) current[key] = (typeof nextKey === 'number' ? [] : {});
        current = current[key];
      } else {
        if (!(key in current) || current[key] == null || typeof current[key] !== 'object') {
          current[key] = (typeof nextKey === 'number' ? [] : {});
        }
        current = current[key];
      }
    }
    const finalKey = tokens[tokens.length - 1];
    if (typeof finalKey === 'number') {
      if (!Array.isArray(current)) {
        // Convert parent to array if needed and assign back to its owner
        // Find parent container and key
        const parentTokens = tokens.slice(0, -1);
        let parent = obj;
        for (let i = 0; i < parentTokens.length - 1; i += 1) {
          parent = parent[parentTokens[i]];
        }
        const parentKey = parentTokens[parentTokens.length - 1];
        parent[parentKey] = Array.isArray(parent[parentKey]) ? parent[parentKey] : [];
        current = parent[parentKey];
      }
      current[finalKey] = value;
    } else {
      current[finalKey] = value;
    }
  }

  /** Deep-merge `incoming` into `base`, recursing into plain objects. */
  deepMerge(base, incoming) {
    const result = { ...base };

    if (!incoming || typeof incoming !== 'object') {
      return result;
    }

    Object.entries(incoming).forEach(([key, value]) => {
      if (key in result) {
        if (
          typeof result[key] === 'object' &&
          result[key] !== null &&
          !Array.isArray(result[key]) &&
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          result[key] = this.deepMerge(result[key], value);
        } else {
          result[key] = value;
        }
      } else {
        // Include keys that are not part of base structure (e.g., newly activated optional groups)
        result[key] = value;
      }
    });

    return result;
  }

  // -----------------------------
  // Centralized mutation helpers
  // -----------------------------

  /** Append an item to an array at `arrayPath` (creating it if missing). */
  pushArrayItem(data, arrayPath, newItem) {
    const arr = this.getNestedValue(data, arrayPath);
    if (Array.isArray(arr)) {
      arr.push(newItem);
    } else {
      this.setNestedValue(data, arrayPath, [newItem]);
    }
    return data;
  }

  /** Remove item at `index` from an array at `arrayPath`. */
  removeArrayItem(data, arrayPath, index) {
    const arr = this.getNestedValue(data, arrayPath);
    if (!Array.isArray(arr)) return data;
    if (index < 0 || index >= arr.length) return data;
    arr.splice(index, 1);
    return data;
  }

  /** Reorder an item from `fromIndex` to `toIndex` within an array. */
  reorderArray(data, arrayPath, fromIndex, toIndex) {
    const arr = this.getNestedValue(data, arrayPath);
    if (!Array.isArray(arr)) return data;
    if (fromIndex === toIndex) return data;
    if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return data;
    const moved = arr.splice(fromIndex, 1)[0];
    arr.splice(toIndex, 0, moved);
    return data;
  }

  /** Ensure an object exists at `path`, creating it from `objectSchema` defaults. */
  ensureObjectAtPath(data, path, objectSchema) {
    const current = this.getNestedValue(data, path);
    if (current && typeof current === 'object' && !Array.isArray(current)) return data;
    const base = this.generateBaseJSON(objectSchema);
    this.setNestedValue(data, path, base);
    return data;
  }
}



