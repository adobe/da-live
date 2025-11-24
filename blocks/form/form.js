import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import getPathDetails from '../shared/pathDetails.js';

import FormModel from './data/model.js';

// Internal utils
import { schemas as schemasPromise, getSchema } from './utils/schema.js';
import { loadHtml, convertHtmlToJson } from './utils/utils.js';
import generateMinimalDataForSchema from './utils/data-generator.js';

import '../edit/da-title/da-title.js';

// Internal Web Components
import './views/editor.js';
import './views/sidebar.js';
import './views/preview.js';

// External Web Components
await import(`${getNx()}/public/sl/components.js`);

// Styling
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-form';

class FormEditor extends LitElement {
  static properties = {
    details: { attribute: false },
    formModel: { state: true },
    _schemas: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.fetchDoc(this.details);
    this._boundOnActivateItemGroup = this.handleActivateItemGroup.bind(this);
    this.attachEventListeners();
  }

  disconnectedCallback() {
    this.detachEventListeners();
    super.disconnectedCallback();
  }

  attachEventListeners() {
    // Capture so we can stop the original before components act
    window.addEventListener('focus-group', this._boundOnActivateItemGroup, { capture: true });
  }

  detachEventListeners() {
    window.removeEventListener('focus-group', this._boundOnActivateItemGroup, { capture: true });
  }

  handleActivateItemGroup(e) {
    const { pointer, source, coordinated } = e?.detail || {};
    if (pointer == null) return;
    // Ignore our own coordination event
    if (source === 'coordinator' || coordinated) return;
    // Prevent components from handling the original event; we will orchestrate
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const isSame = this._focusedPointer != null && this._focusedPointer === pointer;
    // 1) Sync active visuals without scrolling (only if changed)
    if (!isSame) {
      window.dispatchEvent(new CustomEvent('focus-group', {
        detail: { pointer, source: 'coordinator', noScroll: true, coordinated: true },
        bubbles: true,
        composed: true,
      }));
      this._focusedPointer = pointer;
    }
    // 2) Orchestrate scrolling based on source
    if (source === 'sidebar') {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('editor-scroll-to', {
          detail: { pointer },
          bubbles: true,
          composed: true,
        }));
      });
    } else if (source === 'editor') {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('sidebar-scroll-to', {
          detail: { pointer },
          bubbles: true,
          composed: true,
        }));
      });
    } else if (source === 'breadcrumb') {
      // Parallel feel: dispatch both in separate rAFs
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('sidebar-scroll-to', {
          detail: { pointer },
          bubbles: true,
          composed: true,
        }));
      });
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('editor-scroll-to', {
          detail: { pointer },
          bubbles: true,
          composed: true,
        }));
      });
    }
  }

  async fetchDoc() {
    const resultPromise = loadHtml(this.details);

    const [schemas, result] = await Promise.all([schemasPromise, resultPromise]);

    if (schemas) this._schemas = schemas;

    if (!result.html) {
      this.formModel = null;
      return;
    }
    const json = await convertHtmlToJson(result.html);
    this.formModel = new FormModel(json, schemas);
  }

  async handleModelIntent(e) {
    const { default: applyOp } = await import('./utils/rfc6902-patch.js');
    const nextJson = applyOp(this.formModel.json, e.detail);
    this.formModel = new FormModel(nextJson, this._schemas);
  }

  async handleSelectSchema(e) {
    const schemaId = e.target.value;
    if (!schemaId) return;
    let schema = this._schemas?.[schemaId];
    if (!schema) {
      schema = await getSchema(schemaId);
      if (!schema) return;
    }
    const data = generateMinimalDataForSchema(schema);
    const json = { metadata: { schemaName: schemaId }, data };
    this.formModel = new FormModel(json, this._schemas);
  }

  renderSchemaSelector() {
    return html`
      <div class="da-schema-selector"><p class="da-form-title">Please select a schema to get started</p>
      <sl-select @change=${this.handleSelectSchema}>
        <option value="">Select schema</option>
        ${Object.entries(this._schemas).map(([key, value]) => html`
          <option value="${key}">${value.title}</option>
        `)}
      </sl-select></div>`;
  }

  renderFormEditor() {
    if (this.formModel === null) {
      if (this._schemas) return this.renderSchemaSelector();

      return html`
        <p class="da-form-title">Please create a schema</p>
        <a href="https://main--da-live--adobe.aem.live/apps/schema?nx=schema#/${this.details.owner}/${this.details.repo}">Schema Editor</a>
      `;
    }

    return html`
      <div class="da-form-editor">
        <da-form-editor
          .formModel=${this.formModel}
          @form-model-intent=${this.handleModelIntent}
        ></da-form-editor>
        <da-form-preview .formModel=${this.formModel}></da-form-preview>
      </div>`;
  }

  render() {
    return html`
      <div class="da-form-wrapper">
        ${this.formModel !== undefined ? this.renderFormEditor() : nothing}
        ${this.formModel ? html`<da-form-sidebar .formModel=${this.formModel}></da-form-sidebar>` : nothing}
      </div>
    `;
  }
}

customElements.define(EL_NAME, FormEditor);

function setDetails(parent, name, details) {
  const cmp = document.createElement(name);
  cmp.details = details;
  parent.append(cmp);
}

function setup(el) {
  el.replaceChildren();
  const details = getPathDetails();
  setDetails(el, 'da-title', details);
  setDetails(el, EL_NAME, details);
}

export default function init(el) {
  setup(el);
  window.addEventListener('hashchange', () => { setup(el); });
}
