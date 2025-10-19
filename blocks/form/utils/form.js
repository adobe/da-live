import { html, nothing } from 'da-lit';
import { getSchema } from './schema.js';
import { getArrayItemTitle, getObjectTitle, resolveRef } from './utils.js';

// Recursive function to render JSON with schema titles
function renderJson(data, schema, currentSchema, num) {
  // Handle arrays
  if (Array.isArray(data)) {
    // Only render if array contains objects
    const hasObjects = data.some(
      (item) => typeof item === 'object' && item !== null && !Array.isArray(item),
    );
    if (!hasObjects) return nothing;

    // Get the array item title from schema
    const itemTitle = getArrayItemTitle(schema, currentSchema);
    if (!itemTitle) return nothing;

    const itemSchema = currentSchema?.items?.$ref
      ? resolveRef(schema, currentSchema.items.$ref)
      : currentSchema?.items;

    return html`
      <div class="da-form-array">
        <p class="schema-title">${itemTitle}</p>
        ${data.map((item, index) => renderJson(item, schema, itemSchema, index + 1))}
      </div>
    `;
  }

  // Handle objects
  if (typeof data === 'object') {
    const schemaTitle = getObjectTitle(schema, currentSchema);
    if (!schemaTitle) return nothing;

    // Resolve $ref if present to get properties for children
    const resolvedSchema = currentSchema?.$ref
      ? resolveRef(schema, currentSchema.$ref)
      : currentSchema;

    const filtered = Object.entries(data).filter(([k]) => k !== '$schema');
    const rendered = filtered.map(([k, v]) => {
      const propSchema = resolvedSchema?.properties?.[k];
      return renderJson(v, schema, propSchema);
    });

    return html`
      <div class="da-form-object">
        <p class="schema-title">${schemaTitle}</p>
        ${rendered}
      </div>
    `;
  }

  // handle primitives
  return html`
    <div class="da-form-primitive">
      <p>${currentSchema.title} - ${currentSchema.type}</p>
      <sl-input type="text" value=${data} label=></sl-input>
    </div>
  `;
}

export default async function renderForm(json) {
  const { metadata, data } = json;
  const { schemaId } = metadata;
  const schema = await getSchema(schemaId);

  // Get the root schema definition
  const rootSchema = schema.$ref ? resolveRef(schema, schema.$ref) : schema;

  return html`
    <div>
      <h2>${schema.title}</h2>
      <div class="da-form-group">
        ${Object.entries(data).map(([key, value]) => {
          const propSchema = rootSchema?.properties?.[key];
          return renderJson(value, schema, propSchema);
        })}
      </div>
    </div>
  `;
}
