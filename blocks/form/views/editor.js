import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

class FormEditor extends LitElement {
  static properties = {
    formModel: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  renderCheckbox(key, prop) {
    return html`
      <div>
        <p class="schema-title">${prop.schema.title}</p>
        ${prop.schema.items.enum.map((opt) => {
          const isChecked = prop.value.find((val) => val === opt);
          return html`
            <input type="checkbox" id="${opt}" name="${key}" value="${opt}" ?checked=${isChecked}>
            <label for="${opt}">${opt}</label>
          `;
        })}
      </div>
    `;
  }

  // Recursive function to render JSON with schema titles
  renderTree(key, value) {
    // if (Array.isArray(value)) {
    //   console.log('Array');
    //   console.log(key);
    // }

    // if (typeof value === 'object') {
    //   console.log('Object');
    //   console.log(key);
    // }


  //   console.log(prop);
  //   if (prop.schema.type === 'array') {
  //     // if (prop.schema['x-semantic-type'] === 'checkbox') return this.renderCheckbox(key, prop);

  //     return html`
  //       <div class="da-form-array">
  //         <p class="schema-title">${prop.schema.title}</p>
  //         ${prop.value.map((val) => {
  //           const schema = { ...prop.schema.items };
  //           return this.renderTree(key, { value: val, schema });
  //         })}
  //       </div>
  //     `;
  //   }

  //   if (prop.schema.type === 'object') {
  //     const rendered = Object.entries(prop.value).map(([k, p]) => this.renderTree(k, p));

  //     return html`
  //       <div class="da-form-object">
  //         <p class="schema-title">${prop.schema.title} - Nested Object</p>
  //         ${rendered}
  //       </div>
  //     `;
  //   }

  //   if (key === 'keyFeatureList') console.log(prop);

  //   return html`
  //     <div class="da-form-primitive">
  //       <p>${prop.schema.title} - ${prop.schema.type}</p>
  //       <sl-input type="text" name="${key}" value=${prop.value}></sl-input>
  //     </div>`;
  }

  render() {
    if (!this.formModel) return nothing;
    const { json } = this.formModel;

    return html`
      <h2>${this.formModel.schema.title}</h2>
      <form>
        <div class="da-form-array">
          ${Object.entries(json.data).map(([key, value]) => this.renderTree(key, value))}
        </div>
      </form>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
