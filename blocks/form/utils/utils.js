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

export function getPropSchema(key, localSchema, fullSchema) {
  if (key === 'inAppID') {
    console.log(localSchema);
  }

  if (localSchema.$ref) {
    const path = localSchema.$ref.substring(2).split('/')[1];

    // try local ref
    const localRef = localSchema.$defs?.[path].properties;
    if (localRef) return localRef;

    // try full ref
    const fullRef = fullSchema.$defs?.[path].properties;

    if (fullRef) return fullRef;
  }

  return localSchema;
}

/**
 * @param {*} key the key of the property
 * @param {*} prop the current property being acted on
 * @param {*} propSchema the schema that applies to the current property
 * @param {*} fullSchema the full schema that applies to the form
 */
export function matchPropToSchema(key, propData, propSchema, fullSchema) {
  if (Array.isArray(propData)) {
    const resolvedItemsSchema = getPropSchema(key, propSchema.items, fullSchema);

    const data = propData.map((itemPropData, idx) => {
      if (resolvedItemsSchema.oneOf) {
        return resolvedItemsSchema.oneOf.map((oneOf) => {
          const onOfPropSchema = getPropSchema(key, oneOf, fullSchema);
          return matchPropToSchema(`${key}-${idx + 1}`, itemPropData, onOfPropSchema, fullSchema);
        });
      }
      return matchPropToSchema(`${key}-${idx + 1}`, itemPropData, resolvedItemsSchema, fullSchema);
    });

    return { key, data, schema: propSchema };
  }

  if (typeof propData === 'object') {
    const data = {};
    Object.entries(propData).forEach(([k, pD]) => {
      // With oneOf, it's possible there isn't a found schema
      if (!propSchema[k]) return;

      const resolvedSchema = getPropSchema(k, propSchema[k], fullSchema);
      // console.log(k, resolvedSchema);
      data[k] = matchPropToSchema(k, pD, resolvedSchema, fullSchema);
    });
    return { key, data, schema: propSchema };
  }

  return { key, data: propData, schema: propSchema };
}
