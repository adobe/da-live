import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import getPathDetails from '../shared/pathDetails.js';

import FormModel from './data/model.js';

// Internal utils
import { schemas as schemasPromise, getSchema } from './utils/schema.js';
import { loadHtml, convertHtmlToJson } from './utils/utils.js';
import generateMinimalDataForSchema from './utils/data-generator.js';
import applyOp from './utils/rfc6902-patch.js';

import '../edit/da-title/da-title.js';
import ScrollCoordinatorController from './controllers/scroll-coordinator-controller.js';
import PostUpdateActionsController from './controllers/post-update-actions-controller.js';
import ActiveStateController from './controllers/active-state-controller.js';
import ValidationStateModel from './validation/validation-state.js';
import { EVENT_VALIDATION_STATE_CHANGE, SCHEMA_EDITOR_URL } from './constants.js';

// Internal Web Components
import './views/editor.js';
import './views/navigation.js';
import './views/preview.js';

// External Web Components
await import(`${getNx()}/public/sl/components.js`);

// Styling
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-form';

/**
 * Main form editor component.
 * Orchestrates the form editing experience with editor, navigation, and preview panels.
 * Handles schema loading, form model management, and validation state coordination.
 */
class FormEditor extends LitElement {
  static properties = {
    details: { attribute: false },
    formModel: { state: true },
    _schemas: { state: true },
    _validationState: { state: true },
  };

  constructor() {
    super();
    // Controller handles all focus/scroll coordination
    this._scrollCoordinator = new ScrollCoordinatorController(this);
    // Controller handles post-update actions (focus, etc.)
    this._postUpdateActions = new PostUpdateActionsController(this, {
      getChildComponents: () => [
        this.shadowRoot?.querySelector('da-form-editor'),
        this.shadowRoot?.querySelector('da-form-navigation'),
      ],
    });
    // Shared active state controller for both editor and navigation
    this._activeState = new ActiveStateController(this, {
      getDefaultPointer: () => this.formModel?.root?.pointer ?? '',
      isPointerValid: (pointer) => {
        if (!this.formModel) return false;
        return this.formModel.getNode(pointer) != null;
      },
      manualSelectionLockMs: 1000,
    });
    this._validationState = ValidationStateModel.empty();
  }

  get activePointer() {
    return this._activeState?.pointer;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.fetchDoc(this.details);
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

  handleModelIntent(e) {
    const operation = e.detail;
    const nextJson = applyOp(this.formModel.json, operation);
    this.formModel = new FormModel(nextJson, this._schemas);

    // Schedule post-update actions if present in operation
    if (operation.focusAfter) {
      this._postUpdateActions.scheduleAction({
        type: 'focus',
        pointer: operation.focusAfter,
        source: operation.focusSource || 'unknown',
      });
    }
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

  updated(changed) {
    if (changed.has('formModel')) {
      this.rebuildValidationState();
    }
    super.updated(changed);
  }

  rebuildValidationState() {
    if (!this.formModel) {
      this._validationState = ValidationStateModel.empty();
      this.emitValidationState();
      return;
    }
    const validationResult = this.formModel.validate();

    this._validationState = ValidationStateModel.fromResult(
      validationResult,
      this.formModel,
      this.formModel?.json?.data,
    );

    this.emitValidationState();
  }

  emitValidationState() {
    if (!this._validationState) return;
    this.dispatchEvent(new CustomEvent(EVENT_VALIDATION_STATE_CHANGE, {
      detail: this._validationState.toEventDetail(),
      bubbles: true,
      composed: true,
    }));
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
        <a href="${SCHEMA_EDITOR_URL}#/${this.details.owner}/${this.details.repo}">Schema Editor</a>
      `;
    }

    return html`
      <div class="da-form-editor">
        <da-form-editor
          .formModel=${this.formModel}
          .validationState=${this._validationState}
          .activePointer=${this.activePointer}
          @form-model-intent=${this.handleModelIntent}
        ></da-form-editor>
        <da-form-preview .formModel=${this.formModel}></da-form-preview>
      </div>`;
  }

  render() {
    return html`
      <div class="da-form-wrapper">
        ${this.formModel !== undefined ? this.renderFormEditor() : nothing}
        ${this.formModel ? html`
          <da-form-navigation
            .formModel=${this.formModel}
            .validationState=${this._validationState}
            .activePointer=${this.activePointer}
            @form-model-intent=${this.handleModelIntent}
          ></da-form-navigation>
        ` : nothing}
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
