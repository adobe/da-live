/*
 * Copyright 2025 Adobe. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

/**
 * SchemaService
 * 
 * Instance-based helpers for working with JSON Schemas: $ref dereferencing,
 * normalization (choosing a primary type), titles, and base JSON generation.
 */
export class SchemaService {
  /** @param {object} context */
  constructor(context = {}) {
    this._context = context;
    this._derefCache = new WeakMap();
    this._normalizeCache = new WeakMap();
  }

  /** Resolve a JSON Pointer (local) against the provided root schema. */
  resolvePointer(rootSchema, pointer) {
    if (typeof pointer !== 'string') return null;
    if (pointer === '#' || pointer === '') return rootSchema;
    const p = pointer.startsWith('#') ? pointer.slice(1) : pointer;
    const parts = String(p).replace(/^\//, '').split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = rootSchema;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }
    return current;
  }

  /**
   * Resolve a JSON Pointer while transparently traversing through $ref nodes.
   * This behaves as if all $ref were inlined at read time.
   * Returns the EFFECTIVE node (not cloned) or null if not found.
   */
  resolvePointerWithRefs(rootSchema, pointer) {
    if (typeof pointer !== 'string') return null;
    if (pointer === '#' || pointer === '') return rootSchema;
    const p = pointer.startsWith('#') ? pointer.slice(1) : pointer;
    const parts = String(p).replace(/^\//, '').split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = rootSchema;
    for (let i = 0; i < parts.length; i += 1) {
      const token = parts[i];
      // If the current node is a $ref container, dereference it before continuing
      if (current && typeof current === 'object' && current.$ref) {
        current = this.derefNode(rootSchema, current) || current;
      }
      if (!current || typeof current !== 'object') return null;
      if (!(token in current)) return null;
      current = current[token];
    }
    // Final deref to return effective node
    if (current && typeof current === 'object' && current.$ref) {
      current = this.derefNode(rootSchema, current) || current;
    }
    return current;
  }

  /** Return a normalized (deref + primary type) node at pointer, following $ref along the path. */
  getEffectiveNodeAtPointer(rootSchema, pointer) {
    const node = this.resolvePointerWithRefs(rootSchema, pointer);
    return this.normalizeSchema(rootSchema, node);
  }

  /** Get node title at pointer, following $ref along the path; fallback to provided key when missing. */
  getTitleAtPointer(rootSchema, pointer, fallbackKey) {
    const node = this.getEffectiveNodeAtPointer(rootSchema, pointer);
    return this.getSchemaTitle(rootSchema, node, fallbackKey);
  }

  /** Return normalized items schema at array node pointer, following $ref. */
  getArrayItemsAtPointer(rootSchema, pointer) {
    const node = this.getEffectiveNodeAtPointer(rootSchema, pointer);
    if (!node || node.type !== 'array') return null;
    const items = this.derefNode(rootSchema, node.items) || node.items;
    return this.normalizeSchema(rootSchema, items);
  }

  /** Resolve a $ref within the same document; returns a merged effective node. */
  derefNode(rootSchema, node) {
    if (!node || typeof node !== 'object' || !node.$ref || typeof node.$ref !== 'string') return node;
    const cached = this._derefCache.get(node);
    if (cached) return cached;
    const resolvePointer = (ref) => {
      if (!ref.startsWith('#')) return null;
      let pointer = ref.slice(1);
      if (pointer.startsWith('/')) pointer = pointer.slice(1);
      if (!pointer) return rootSchema;
      const parts = pointer.split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
      let current = rootSchema;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) current = current[part];
        else return null;
      }
      return current;
    };
    const target = resolvePointer(node.$ref);
    const result = !target ? { ...node } : { ...target, ...Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$ref')) };
    this._derefCache.set(node, result);
    return result;
  }

  /** Normalize a schema node: dereference and coerce `type` arrays to a primary. */
  normalizeSchema(rootSchema, node) {
    if (!node || typeof node !== 'object') return node;
    const cached = this._normalizeCache.get(node);
    if (cached) return cached;
    const s = this.derefNode(rootSchema, node) || node;
    if (!s || typeof s !== 'object') return s;
    const out = { ...s };
    if (Array.isArray(out.type)) {
      const primary = out.type.find((t) => t !== 'null') || out.type[0];
      out.type = primary;
    }
    this._normalizeCache.set(node, out);
    return out;
  }

  /** Get a human-friendly title for a property or use a formatted fallback key. */
  getSchemaTitle(rootSchema, propSchema, fallbackKey) {
    const src = this.derefNode(rootSchema, propSchema) || propSchema;
    return (src && typeof src.title === 'string' && src.title.trim().length > 0)
      ? src.title
      : (fallbackKey ? fallbackKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).replace(/_/g, ' ') : '');
  }

  /** Generate a base JSON object matching the provided schema structure. */
  generateBaseJSON(rootSchema, schema, seenRefs = new Set()) {
    const normalizedRoot = this.normalizeSchema(rootSchema, schema) || schema;
    if (!normalizedRoot || normalizedRoot.type !== 'object' || !normalizedRoot.properties) {
      return {};
    }
    const baseData = {};
    Object.entries(normalizedRoot.properties).forEach(([key, originalPropSchema]) => {
      const effective = this.normalizeSchema(rootSchema, originalPropSchema) || originalPropSchema;
      const refStr = originalPropSchema && originalPropSchema.$ref ? String(originalPropSchema.$ref) : null;
      if (refStr) {
        if (seenRefs.has(refStr)) {
          return;
        }
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
          baseData[key] = this.generateBaseJSON(rootSchema, effective, seenRefs);
          break;
        default: {
          if (effective && typeof effective === 'object' && effective.properties) {
            baseData[key] = this.generateBaseJSON(rootSchema, effective, seenRefs);
          } else if (effective && effective.enum) {
            baseData[key] = effective.default || '';
          } else {
            baseData[key] = effective && Object.prototype.hasOwnProperty.call(effective, 'default') ? effective.default : null;
          }
        }
      }
      if (refStr) {
        seenRefs.delete(refStr);
      }
    });
    return baseData;
  }

}

export default SchemaService;


