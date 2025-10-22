import { html } from 'da-lit';

function renderCheckbox(key, prop) {
  return html`
    <div>
      <p class="schema-title">${prop.schema.title}</p>
      ${prop.schema.items.enum.map((opt) => {
        const isChecked = prop.value.find((val) => val === opt);
        return html`
          <input type="checkbox" id="sports" name="${key}" value="${opt}" ?checked=${isChecked}>
          <label for="sports">${opt}</label>
        `;
      })}
    </div>
  `;
}

// Recursive function to render JSON with schema titles
function renderJson(key, prop) {
  if (prop.schema.type === 'array') {
    if (prop.schema['x-semantic-type'] === 'checkbox') return renderCheckbox(key, prop);

    return html`
      <div class="da-form-array">
        <p class="schema-title">${prop.schema.title}</p>
        ${prop.value.map((val) => {
          const schema = { ...prop.schema.items };
          return renderJson(key, { value: val, schema });
        })}
      </div>
    `;
  }

  if (prop.schema.type === 'object') {
    const rendered = Object.entries(prop.value).map(([k, p]) => renderJson(k, p));

    return html`
      <div class="da-form-object">
        <p class="schema-title">${prop.schema.title}</p>
        ${rendered}
      </div>
    `;
  }

  return html`
    <div class="da-form-primitive">
      <p>${prop.schema.title} - ${prop.schema.type}</p>
      <sl-input type="text" name="${key}" value=${prop.value}></sl-input>
    </div>`;
}

export default function renderForm(formModel) {
  const { annotatedJson: data } = formModel;

  return html`
    <h2>Hello</h2>
    <form>
      <div class="da-form-array">
        ${Object.entries(data).map(([key, prop]) => renderJson(key, prop))}
      </div>
    </form>
  `;
}
