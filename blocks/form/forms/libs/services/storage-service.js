/*
 * Copyright 2025 Adobe
 */

import { parseDocument as baseParse, serializeDocument as baseSerialize } from './storage/index.js';

/**
 * StorageService
 * Wrapper around storage parse/serialize that injects context and services.
 */
/**
 * StorageService
 *
 * Facade over storage backends that parse and serialize form HTML blocks.
 * Injects the app context for loaders needing services.
 */
export class StorageService {
  /** @param {object} context */
  constructor(context = {}) {
    this._context = context || {};
  }

  /** Parse an HTML document string into { metadata, data }. */
  parseDocument(htmlString, { storageVersion } = {}) {
    return baseParse(htmlString, { storageVersion, context: this._context, services: this._context.services });
  }

  /** Serialize form metadata and data into HTML block markup. */
  serializeDocument({ formMeta, formData }, { storageVersion } = {}) {
    return baseSerialize({ formMeta, formData }, { storageVersion });
  }
}

export default StorageService;



