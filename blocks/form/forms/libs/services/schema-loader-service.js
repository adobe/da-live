/* eslint-disable no-console */

/**
 * SchemaLoaderService
 *
 * Fetches JSON Schemas from a GitHub repository and maintains a cache.
 */
export class SchemaLoaderService {
  /** @param {object} context - { org, repo, ref, services } */
  constructor(context = {}) {
    this._context = context || {};
    const owner = this._context?.org || 'kozmaadrian';
    const repo = this._context?.repo || 'mhast-demo';
    const ref = (this._context?.ref === 'local') ? 'main' : (this._context?.ref || 'main');
    const basePath = 'forms/';
    this._config = { owner, repo, ref, basePath };
    this.cache = new Map();
    this.availableSchemas = new Set();
  }

  /** Build the base raw.githubusercontent URL for the configured repo/ref. */
  _buildBaseUrl() {
    const { owner, repo, basePath, ref } = this._config;
    const normalizedBase = (basePath || '').replace(/^\/+/, '').replace(/\/+/, '/');
    const baseWithSlash = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;
    return `https://${ref}--${repo}--${owner}.aem.live/${baseWithSlash}`;
  }

  /** Fetch and cache a schema by name (e.g., "user-profile"). */
  async loadSchema(schemaName) {
    if (this.cache.has(schemaName)) return this.cache.get(schemaName);
    try {
      const url = `${this._buildBaseUrl()}${schemaName}.schema.json`;
      const response = await fetch(url);
      if (!response.ok) {
        console.warn('[schema-loader] fetch failed', response.status, response.statusText);
        throw new Error(`Failed to load schema ${schemaName}: ${response.status} ${response.statusText}`);
      }
      const schema = await response.json();
      const hasProps = schema && schema.type === 'object' && typeof schema.properties === 'object';
      const hasRef = schema && typeof schema.$ref === 'string' && schema.$ref.length > 0;
      const hasComposition = schema && (Array.isArray(schema.allOf) || Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf));
      if (!hasProps && !hasRef && !hasComposition) {
        throw new Error(`Invalid schema format for ${schemaName}`);
      }
      this.cache.set(schemaName, schema);
      this.availableSchemas.add(schemaName);
      return schema;
    } catch (error) {
      console.error(`[schema-loader] Error loading schema ${schemaName}:`, error);
      throw error;
    }
  }

  /** Fetch the manifest and return the list of valid schema names. */
  async discoverSchemas() {
    try {
      const manifestUrl = `${this._buildBaseUrl()}manifest.json`;
      const response = await fetch(manifestUrl);
      if (response.ok) {
        const manifest = await response.json();
        if (manifest.schemas && Array.isArray(manifest.schemas)) {
          const validSchemas = [];
          for (const schemaName of manifest.schemas) {
            try {
              await this.loadSchema(schemaName);
              validSchemas.push(schemaName);
            } catch (error) {
              console.warn('[schema-loader] manifest entry failed:', schemaName, error?.message || error);
            }
          }
          return validSchemas;
        }
        console.warn('[schema-loader] Manifest loaded but invalid format:', manifest);
      }
    } catch (error) {
      console.warn('[schema-loader] Failed to load or parse manifest:', error?.message || error);
    }
    return [];
  }

  /** Return cached schema names discovered so far. */
  getCachedSchemas() {
    return Array.from(this.availableSchemas);
  }

  /** Clear in-memory caches for schemas and names. */
  clearCache() {
    this.cache.clear();
    this.availableSchemas.clear();
  }

  /** Convert a dash-separated schema id into a human-friendly name. */
  formatSchemaName(schemaName) {
    return `${schemaName
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')} Form`;
  }

  /** Load a schema plus compute initial data using SchemaService. */
  async loadSchemaWithDefaults(schemaName) {
    const schema = await this.loadSchema(schemaName);
    // Compute initial data using the schema service from the service container in context
    const schemaService = this._context?.services?.schema;
    const initialData = schemaService.generateBaseJSON(schema, schema);
    return { schema, initialData };
  }

  /**
   * Returns remote schema items list with display names (no local logic here).
   * Applies a simple sessionStorage cache for remote results.
   * @returns {Promise<Array<{id:string,name:string}>>}
   */
  async getSchemasList() {
    const cacheKey = 'forms.schemas.manifest';
    let items = [];
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) items = JSON.parse(cached) || [];
    } catch {}

    if (!items || items.length === 0) {
      const remoteNames = await this.discoverSchemas();
      const remote = remoteNames.map((id) => ({ id, name: this.formatSchemaName(id) }));
      items = Array.isArray(remote) ? remote : [];
      try { sessionStorage.setItem(cacheKey, JSON.stringify(items)); } catch {}
    }
    return items;
  }
}

export default SchemaLoaderService;
