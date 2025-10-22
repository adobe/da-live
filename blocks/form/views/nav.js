import { html, nothing } from 'da-lit';
import { getSchema } from '../utils/schema.js';
import { resolveRef, getArrayItemTitle, getObjectTitle } from '../utils/utils.js';

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
      <li>
        <span class="schema-title">${itemTitle}</span>
        <ul>
          ${data.map((item, index) => renderJson(item, schema, itemSchema, index + 1))}
        </ul>
      </li>
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
      <li>
        <span class="schema-title">${schemaTitle}</span>
        ${num ? html`<span>${num}</span>` : nothing}
        ${filtered.length ? html`<ul class="obj">${rendered}</ul>` : nothing}
      </li>
    `;
  }

  // Skip primitives
  return nothing;
}

export default function renderNav(formModel) {
  const { data } = formModel.json;
  const { schema } = formModel;

  // Get the root schema definition
  const rootSchema = schema.$ref ? resolveRef(schema, schema.$ref) : schema;

  return html`
    <div class="nav-list">
      <ul>
        <li>
          <span>${schema.title}</span>
          <ul>
          ${Object.entries(data).map(([key, value]) => {
            const propSchema = rootSchema?.properties?.[key];
            return renderJson(value, schema, propSchema);
          })}
          </ul>
        </li>
      </ul>
    </div>
  `;
}
