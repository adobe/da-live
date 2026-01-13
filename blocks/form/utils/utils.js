import { daFetch } from '../../shared/utils.js';

export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}

function resolvePropSchema(key, localSchema, fullSchema) {
  const { title } = localSchema;

  if (localSchema.$ref) {
    const path = localSchema.$ref.substring(2).split('/')[1];

    // try local ref
    let def = localSchema.$defs?.[path];
    // TODO: walk up the tree looking for the def
    // try global ref
    if (!def) def = fullSchema.$defs?.[path];
    if (def) {
      if (!title) return def;
      return { ...def, title };
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
        // TODO: Support one of schemas
        // propSchema.items.oneOf.forEach((oneOf) => {
        //   console.log(oneOf);
        //   data.push(annotateProp(key, itemPropData, oneOf, fullSchema));
        // });
      } else {
        data.push(annotateProp(key, itemPropData, propSchema.items, fullSchema));
      }
    });

    return { key, data, schema: resolvedSchema };
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
