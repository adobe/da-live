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

export function getSchemaTitle(key, localSchema, fullSchema) {
  if (localSchema.$ref) {
    const path = localSchema.$ref.substring(2).split('/')[1];

    // try local ref
    let title = localSchema.$defs?.[path].title;
    // try global ref
    if (!title) title = fullSchema.$defs?.[path].title;

    if (title) return title;
  }

  return localSchema.title;
}

export function getPropSchema(key, localSchema, fullSchema) {
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
    const resolvedTitle = getSchemaTitle(key, propSchema.items, fullSchema);
    const title = resolvedTitle || propSchema.title;

    const resolvedItemsSchema = getPropSchema(key, propSchema.items, fullSchema);

    const data = propData.map((itemPropData, idx) => {
      if (resolvedItemsSchema.oneOf) {
        return resolvedItemsSchema.oneOf.map((oneOf) => {
          const onOfPropSchema = getPropSchema(key, oneOf, fullSchema, resolvedItemsSchema);

          return matchPropToSchema(`${title} ${idx + 1}`, itemPropData, onOfPropSchema, fullSchema);
        });
      }
      return matchPropToSchema(`${title} ${idx + 1}`, itemPropData, resolvedItemsSchema, fullSchema);
    });

    return { key, data, title, schema: propSchema };
  }

  if (typeof propData === 'object') {
    const data = Object.entries(propData).map(([k, pD]) => {
      // With oneOf, it's possible there isn't a found schema
      if (!propSchema[k]) return {};

      // Get the local title
      const { title } = propSchema[k];

      const resolvedSchema = getPropSchema(k, propSchema[k], fullSchema);

      return { ...matchPropToSchema(k, pD, resolvedSchema, fullSchema), title };
    });

    return { key, data, title: propSchema.title, schema: propSchema };
  }

  return { key, data: propData, title: 'PRIMITIVE', schema: propSchema };
}

export function resolvePropSchema(key, localSchema, fullSchema) {
  if (key === 'itemList') console.log(localSchema);
  const { title } = localSchema;

  if (localSchema.$ref) {
    const path = localSchema.$ref.substring(2).split('/')[1];

    // try local ref
    let def = localSchema.$defs?.[path];
    // TODO: walk up the tree looking for the def
    // try global ref
    if (!def) def = fullSchema.$defs?.[path];
    if (def) {
      if (title) def.title = title;
      return def;
    }
  }

  // Normalize local props to the same format as referenced schema
  return { title, properties: localSchema };
}

/**
 * @param {*} key the key of the property
 * @param {*} prop the current property being acted on
 * @param {*} propSchema the schema that applies to the current property
 * @param {*} fullSchema the full schema that applies to the form
 */
export function annotateProp(key, propData, propSchema, fullSchema) {
  // Will have schema.props
  const resolvedSchema = resolvePropSchema(key, propSchema, fullSchema);

  if (Array.isArray(propData)) {
    const resolvedItemsSchema = resolvePropSchema(key, propSchema.items, fullSchema);

    // It's possible that items do not have a title, let them inherit from the parent
    resolvedItemsSchema.title ??= resolvedSchema.title;

    const data = [];

    // Loop through the actual data and match it to the item schema
    propData.forEach((itemPropData) => {
      if (propSchema.items.oneOf) {
        // propSchema.items.oneOf.forEach((oneOf) => {
        //   console.log(oneOf);
        //   data.push(annotateProp(key, itemPropData, oneOf, fullSchema));
        // });
      } else {
        data.push(annotateProp(key, itemPropData, propSchema.items, fullSchema));
      }
    });

    return { key, data, schema: resolvedItemsSchema };
  }

  if (typeof propData === 'object') {
    // Loop through the data and match it to the item schema
    // return as array to keep consistent with upper array
    const data = Object.entries(propData).reduce((acc, [k, pD]) => {
      if (resolvedSchema.properties[k]) {
        acc.push(annotateProp(k, pD, resolvedSchema.properties[k], fullSchema));
      }

      return acc;
    }, []);

    return { key, data, schema: resolvedSchema };
  }

  return { key, data: propData, schema: resolvedSchema };
}
