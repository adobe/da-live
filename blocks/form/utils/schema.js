import { DA_ORIGIN } from '../../shared/constants.js';
import getPathDetails from '../../shared/pathDetails.js';
import { daFetch } from '../../shared/utils.js';

// Constants
const FORMS_BASE_PATH = '/.da/forms';
const SCHEMA_FILE_EXTENSION = '.schema.json';
const TEST_SCHEMA_PREFIX = '🧪';
const MOCKS_PATH = '../mocks/';
const JSON_POINTER_PREFIX = '#/';
const JSON_POINTER_PREFIX_LENGTH = 2;
const JSON_POINTER_ROOT = '#';

/**
 * Load a test schema from the local mocks directory.
 * @param {string} schemaFilename - Name of schema file (without extension)
 * @returns {Promise<object|null>} Schema object or null if not found
 */
async function loadLocalTestSchema(schemaFilename) {
  try {
    const schemaUrl = `${MOCKS_PATH}${schemaFilename}${SCHEMA_FILE_EXTENSION}`;
    const response = await fetch(new URL(schemaUrl, import.meta.url));
    if (!response.ok) {
      return null;
    }
    const schema = await response.json();
    return {
      id: schemaFilename,
      title: `${TEST_SCHEMA_PREFIX} ${schema.title || schemaFilename}`,
      ...schema,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Load and inject a local test schema if specified via ?localSchema query parameter.
 * @param {object} schemasObj - Object to inject the schema into
 * @returns {Promise<void>}
 */
async function loadAndInjectLocalSchema(schemasObj) {
  const urlParams = new URLSearchParams(window.location.search);
  const localSchemaName = urlParams.get('localSchema');

  if (!localSchemaName) {
    return;
  }

  const localSchema = await loadLocalTestSchema(localSchemaName);
  if (localSchema) {
    schemasObj[localSchema.id] = localSchema;
    // eslint-disable-next-line no-console
    console.info(`📋 Loaded local test schema: ${localSchema.title} (${localSchemaName})`);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`⚠️ Could not load local schema: ${localSchemaName}${SCHEMA_FILE_EXTENSION}`);
  }
}

/**
 * Extract JSON schema from an HTML page containing a code element.
 * @param {string} html - HTML content
 * @returns {object} Parsed schema object or error object
 */
function extractSchemaFromHtml(html) {
  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');
  const codeElement = dom.querySelector('code');

  if (!codeElement) {
    return { error: 'Invalid schema format: no code element found' };
  }

  try {
    return JSON.parse(codeElement.textContent);
  } catch (error) {
    return { error: `Invalid JSON in schema: ${error.message}` };
  }
}

/**
 * Load a remote schema from the DA origin.
 * @param {object} schema - Schema metadata containing path
 * @returns {Promise<object>} Schema object or error object
 */
async function loadCurrentSchema(schema) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${schema.path}`);
    if (!resp.ok) {
      return { error: `Failed to load schema: ${resp.status} ${resp.statusText}` };
    }
    const html = await resp.text();
    return extractSchemaFromHtml(html);
  } catch (error) {
    return { error: `Schema parsing failed: ${error.message}` };
  }
}

/**
 * Build the path to the schemas directory for the current project.
 * @returns {string} Path to schemas directory
 */
function getSchemasPath() {
  const { owner: org, repo: site } = getPathDetails();
  return `/${org}/${site}${FORMS_BASE_PATH}/schemas`;
}

/**
 * Load remote schemas from the DA origin.
 * @returns {Promise<object>} Object mapping schema IDs to schema objects
 */
async function loadRemoteSchemas() {
  const schemasObj = {};
  const path = getSchemasPath();

  const resp = await daFetch(`${DA_ORIGIN}/list${path}`);
  if (!resp.ok) {
    return schemasObj;
  }

  const json = await resp.json();
  if (!json) {
    return schemasObj;
  }

  // Load all schemas in parallel
  const schemas = await Promise.all(json.map(async (schema) => {
    const loaded = await loadCurrentSchema(schema);
    return { id: schema.name, ...loaded };
  }));

  // Build lookup object, filtering out failed schemas
  schemas.forEach((schema) => {
    // Only add schemas that loaded successfully (no error property)
    if (!schema.error) {
      schemasObj[schema.id] = schema;
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Failed to load schema "${schema.id}": ${schema.error}`);
    }
  });

  return schemasObj;
}

/**
 * Load all schemas (local test schemas + remote schemas).
 * @returns {Promise<object>} Object mapping schema IDs to schema objects
 */
async function loadSchemas() {
  const schemasObj = {};

  // Load local test schema if specified via query parameter
  await loadAndInjectLocalSchema(schemasObj);

  // Load and merge remote schemas
  const remoteSchemas = await loadRemoteSchemas();
  Object.assign(schemasObj, remoteSchemas);

  return schemasObj;
}

// Schema cache
let cachedSchemasPromise = null;

/**
 * Get all schemas (cached after first load).
 * Loads both local test schemas and remote schemas from the DA origin.
 * @returns {Promise<object>} Object mapping schema IDs to schema objects
 */
export async function getSchemas() {
  if (!cachedSchemasPromise) {
    cachedSchemasPromise = loadSchemas();
  }
  return cachedSchemasPromise;
}

/**
 * Get a specific schema by name.
 * @param {string} schemaName - Schema identifier
 * @returns {Promise<object|undefined>} Schema object or undefined if not found
 */
export async function getSchema(schemaName) {
  const schemas = await getSchemas();
  return schemas[schemaName];
}

/**
 * Promise that resolves to all schemas.
 * For backward compatibility with code that does: const loaded = await schemas;
 * Prefer using getSchemas() for clearer intent.
 */
export const schemas = getSchemas();

/**
 * Validate a JSON Reference string.
 * @param {string} ref - Reference to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateJsonReference(ref) {
  if (!ref || typeof ref !== 'string') {
    // eslint-disable-next-line no-console
    console.warn('Schema resolution: Invalid $ref', ref);
    return false;
  }

  // Only handle internal references (starting with #)
  if (!ref.startsWith(JSON_POINTER_ROOT)) {
    // eslint-disable-next-line no-console
    console.warn('Schema resolution: External $ref not supported', ref);
    return false;
  }

  return true;
}

/**
 * Unescape a JSON Pointer token (RFC 6901).
 * Converts ~1 to / and ~0 to ~
 * Must process ~1 before ~0 to avoid double-unescaping.
 * @param {string} token - Escaped token
 * @returns {string} Unescaped token
 */
function unescapeJsonPointerToken(token) {
  // Use string replace for better performance (no RegExp allocation)
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Parse a JSON Pointer reference into path segments.
 * @param {string} ref - JSON Pointer reference (e.g., "#/properties/name")
 * @returns {string[]|null} Array of unescaped path segments or null if invalid
 */
function parseJsonPointer(ref) {
  // Invalid format check
  if (!ref.startsWith(JSON_POINTER_PREFIX)) {
    // eslint-disable-next-line no-console
    console.warn('Schema resolution: Invalid reference format', ref);
    return null;
  }

  const pointer = ref.substring(JSON_POINTER_PREFIX_LENGTH);
  const segments = pointer.split('/');

  // Unescape each segment
  return segments.map(unescapeJsonPointerToken);
}

/**
 * Traverse a schema object following JSON Pointer path segments.
 * @param {object} schema - Schema to traverse
 * @param {string[]} segments - Path segments to follow
 * @param {string} originalRef - Original reference (for error messages)
 * @returns {object|undefined} Resolved value or undefined if not found
 */
function traverseSchemaPath(schema, segments, originalRef) {
  let current = schema;

  for (let i = 0; i < segments.length; i += 1) {
    const key = segments[i];

    if (current === null || current === undefined) {
      // eslint-disable-next-line no-console
      console.warn(
        `Schema resolution: Cannot resolve $ref "${originalRef}" - `
        + `path not found at segment "${key}" (index ${i})`,
      );
      return undefined;
    }

    // Check if property exists
    if (!(key in current)) {
      // eslint-disable-next-line no-console
      console.warn(
        `Schema resolution: Cannot resolve $ref "${originalRef}" - `
        + `property "${key}" not found at index ${i}`,
      );
      return undefined;
    }

    current = current[key];
  }

  return current;
}

/**
 * Resolve a JSON Reference ($ref) against a schema.
 * Supports JSON Pointer notation (RFC 6901):
 * - #/$defs/address → Definition in $defs
 * - #/properties/pricing → Root property
 * - # → Root schema
 *
 * @param {object} schema - Full schema object to resolve against
 * @param {string} ref - JSON Reference (e.g., "#/properties/pricing")
 * @returns {object|undefined} Resolved schema or undefined if not found
 */
export function getSchemaDef(schema, ref) {
  // Validate schema parameter
  if (!schema || typeof schema !== 'object') {
    // eslint-disable-next-line no-console
    console.warn('getSchemaDef: schema must be an object', schema);
    return undefined;
  }

  // Validate reference
  if (!validateJsonReference(ref)) {
    return undefined;
  }

  // Handle root reference
  if (ref === JSON_POINTER_ROOT) {
    return schema;
  }

  // Parse pointer into segments
  const segments = parseJsonPointer(ref);
  if (!segments) {
    return undefined;
  }

  // Traverse schema following the path
  return traverseSchemaPath(schema, segments, ref);
}

/**
 * Resolve a $ref (any JSON Pointer format) against the provided schema.
 * This is a convenience wrapper around getSchemaDef with validation.
 *
 * @param {object} schema - Full schema object to resolve against
 * @param {string} ref - JSON Reference (e.g., "#/$defs/address", "#/properties/pricing")
 * @returns {object|undefined} Resolved schema or undefined if not found
 */
export function derefRef(schema, ref) {
  if (!schema) {
    // eslint-disable-next-line no-console
    console.warn('derefRef: schema is required');
    return undefined;
  }
  if (typeof ref !== 'string') {
    // eslint-disable-next-line no-console
    console.warn('derefRef: ref must be a string', ref);
    return undefined;
  }
  return getSchemaDef(schema, ref);
}

/**
 * Normalize a property schema by resolving $ref and preserving local title.
 * Mirrors the behavior used in other utilities for consistent schema traversal.
 *
 * @param {object} fullSchema - Full schema object for resolving $ref
 * @param {string} key - Property key (used for context in errors)
 * @param {object} localSchema - The property schema (may contain $ref)
 * @returns {object} Resolved schema with local title preserved
 */
export function resolvePropSchema(fullSchema, key, localSchema) {
  const normalizedLocal = localSchema || {};

  if (!fullSchema) {
    // eslint-disable-next-line no-console
    console.warn(`resolvePropSchema: fullSchema is required for key "${key}"`);
    return normalizedLocal;
  }

  const { title } = normalizedLocal;

  if (normalizedLocal.$ref) {
    const def = derefRef(fullSchema, normalizedLocal.$ref);
    if (def) {
      // Preserve local title override if present, otherwise return the dereferenced schema as-is
      return title ? { ...def, title } : def;
    }
  }

  // Return the original schema without inventing structure
  return normalizedLocal;
}

/**
 * Resolve the root schema representation for generation/annotation.
 * If the schema has a root-level $ref, dereferences it while preserving title.
 *
 * @param {object} schema - Schema object (may have root-level $ref)
 * @returns {object} Normalized schema with $ref resolved
 */
export function normalizeRoot(schema) {
  if (!schema) {
    // eslint-disable-next-line no-console
    console.warn('normalizeRoot: schema is required');
    return {};
  }

  if (schema.$ref) {
    const root = derefRef(schema, schema.$ref);
    if (!root) {
      // eslint-disable-next-line no-console
      console.warn(`normalizeRoot: Failed to resolve root $ref "${schema.$ref}"`);
      return schema;
    }
    // Preserve top-level title override if present
    return schema.title ? { ...root, title: schema.title } : root;
  }

  return schema;
}
