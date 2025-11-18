import { DA_ORIGIN } from '../../shared/constants.js';
import getPathDetails from '../../shared/pathDetails.js';
import { daFetch } from '../../shared/utils.js';

const FORMS_BASE_PATH = '/.da/forms';

async function loadCurrentSchema(schema) {
  const resp = await daFetch(`${DA_ORIGIN}/source${schema.path}`);
  if (!resp.ok) return { error: 'Could not load current schema.' };
  const html = await resp.text();
  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');
  const jsonStr = dom.querySelector('code').textContent;
  return JSON.parse(jsonStr);
}

async function loadSchemas() {
  const { owner: org, repo: site } = getPathDetails();

  const path = `/${org}/${site}/${FORMS_BASE_PATH}/schemas`;

  const resp = await daFetch(`${DA_ORIGIN}/list${path}`);
  if (!resp.ok) {
    console.log(`Cannot fetch schemas from ${path}.`);
    return {};
  }

  const json = await resp.json();
  if (!json) {
    console.log('Cannot read schemas.');
    return {};
  }

  const schemas = await Promise.all(json.map(async (schema) => {
    const loaded = await loadCurrentSchema(schema);
    return { id: schema.name, ...loaded };
  }));

  const schemasObj = schemas.reduce((acc, schema) => {
    acc[schema.id] = schema;
    return acc;
  }, {});

  return schemasObj;
}

export const schemas = (() => new Promise((resolve) => {
  let loadedSchemas;

  // Load and cache schemas if needed
  if (!loadedSchemas) {
    loadSchemas().then((loaded) => {
      loadedSchemas = loaded;
      resolve(loadedSchemas);
    });
  } else {
    resolve(loadedSchemas);
  }
}))();

export async function getSchema(schemaName) {
  const loaded = await schemas;
  return loaded[schemaName];
}

export function getSchemaDef(schema, ref) {
  return schema.$defs[ref.replace('#/$defs/', '')];
}

export function getPropDef(schema, prop) {
  return schema?.$defs?.[prop];
}

export function getProp(schema, propName) {
  const def = getSchemaDef(schema);
  const prop = def.properties[propName];
  if (!prop) {
    return { title: `${propName} (no def)` };
  }
  return prop;
}

/**
 * Resolve a local $ref (format '#/$defs/Name') against the provided schema.
 * @param {string} ref
 * @param {object} fullSchema
 * @returns {object|undefined}
 */
export function derefRef(ref, fullSchema) {
  if (typeof ref !== 'string') return undefined;
  return getSchemaDef(fullSchema, ref);
}

/**
 * Normalize a property schema by resolving $ref and preserving local title.
 * Mirrors the behavior used in other utilities for consistent schema traversal.
 * @param {string} key
 * @param {object} localSchema
 * @param {object} fullSchema
 * @returns {object}
 */
export function resolvePropSchema(key, localSchema, fullSchema) {
  const normalizedLocal = localSchema || {};
  const { title } = normalizedLocal;
  if (normalizedLocal.$ref) {
    const def = derefRef(normalizedLocal.$ref, fullSchema);
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
 * @param {object} schema
 * @returns {object}
 */
export function normalizeRoot(schema) {
  if (schema?.$ref) {
    const root = derefRef(schema.$ref, schema);
    if (!root) return schema;
    // Preserve top-level title override if present
    return schema.title ? { ...root, title: schema.title } : root;
  }
  return schema;
}
