import { DA_ORIGIN } from '../../shared/constants.js';
import getPathDetails from '../../shared/pathDetails.js';
import { daFetch } from '../../shared/utils.js';

const FORMS_BASE_PATH = '/.da/forms';

async function loadCurrentSchema(schema) {
  const resp = await daFetch(`${DA_ORIGIN}/source${schema.path}`);
  if (!resp.ok) return { error: 'Could not load current schema.' };
  return resp.json();
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
  console.log(schema);
  console.log(prop);
}

export function getProp(schema, propName) {
  const def = getSchemaDef(schema);
  const prop = def.properties[propName];
  if (!prop) {
    return { title: `${propName} (no def)` };
  }
  return prop;
}
