import { daFetch } from '../../shared/utils.js';
import HTMLToJSON from './converters.js';

export async function convertHtmlToJson(html) {
  const { json } = new HTMLToJSON(html);
  return json;
}

export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}

export function getPropSchema(key, localSchema, fullSchema, propSchema) {
  const title = localSchema.title || propSchema.title;
  if (localSchema.$ref) {
    const path = localSchema.$ref.substring(2).split('/')[1];

    // try local ref
    const localRef = localSchema.$defs?.[path].properties;
    if (localRef) return { ...localRef, title };

    // try full ref
    const fullRef = fullSchema.$defs?.[path].properties;

    if (fullRef) return { ...fullRef, title };
  }

  return { ...localSchema, title };
}

/**
 * @param {*} key the key of the property
 * @param {*} prop the current property being acted on
 * @param {*} propSchema the schema that applies to the current property
 * @param {*} fullSchema the full schema that applies to the form
 */
export function matchPropToSchema(key, propData, propSchemaTitle, propSchema, fullSchema) {
  if (Array.isArray(propData)) {
    const resolvedItemsSchema = getPropSchema(key, propSchema.items, fullSchema, propSchema);

    const data = propData.map((itemPropData, idx) => {
      if (resolvedItemsSchema.oneOf) {
        return resolvedItemsSchema.oneOf.map((oneOf) => {
          const onOfPropSchema = getPropSchema(key, oneOf, fullSchema, resolvedItemsSchema);
          return matchPropToSchema(`${key}-${idx + 1}`, itemPropData, propSchemaTitle, onOfPropSchema, fullSchema);
        });
      }
      return matchPropToSchema(`${key}-${idx + 1}`, itemPropData, propSchemaTitle, resolvedItemsSchema, fullSchema);
    });

    return { key, data, title: propSchemaTitle, schema: propSchema };
  }

  if (typeof propData === 'object') {
    const data = {};
    Object.entries(propData).forEach(([k, pD]) => {
      // With oneOf, it's possible there isn't a found schema
      if (!propSchema[k]) return;

      const resolvedSchema = getPropSchema(k, propSchema[k], fullSchema, propSchema);

      data[k] = matchPropToSchema(k, pD, resolvedSchema.title, resolvedSchema, fullSchema);
    });
    return { key, data, title: propSchemaTitle, schema: propSchema };
  }

  return { key, data: propData, title: propSchemaTitle, schema: propSchema };
}
