import { LitElement, html, nothing } from 'da-lit';
import "https://da.live/nx/public/sl/components.js";
import getStyle from "https://da.live/nx/utils/styles.js";
import "./components/title/title.js";
import { ServiceContainer } from "./libs/services/service-container.js";
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { DA_LIVE, MHAST_LIVE } from "./utils.js";
import mountFormUI from './libs/form-ui/form-mount.js';

const style = await getStyle(import.meta.url);
const formContentStyles = await getStyle((new URL('./libs/form-ui/styles/form-ui.content.css', import.meta.url)).href);
const formGroupsStyles = await getStyle((new URL('./libs/form-ui/styles/form-ui.groups.css', import.meta.url)).href);
const formInputsStyles = await getStyle((new URL('./libs/form-ui/styles/form-ui.inputs.css', import.meta.url)).href);
const formNavigationStyles = await getStyle((new URL('./libs/form-ui/styles/form-ui.navigation.css', import.meta.url)).href);

/**
 * FormsEditor
 *
 * Standalone web component that loads a page's form data from DA, lets the
 * user pick a JSON Schema, mounts the schema-driven Form UI, and provides
 * actions to save/preview/publish via backend services.
 */
class FormsEditor extends LitElement {
  static properties = {
    documentData: { type: Object },
    loading: { type: Boolean },
    error: { type: String },
    schemas: { type: Array },
    selectedSchema: { type: String },
    loadingSchemas: { type: Boolean },
    schemaError: { type: String },
    showSchemaDialog: { type: Boolean },
    context: { type: Object },
  };

  /** Initialize editor state and internal references. */
  constructor() {
    super();
    this.documentData = null;
    this.loading = false;
    this.error = null;
    // Form UI runtime refs
    this._formApi = null;
    this._schemaLoaderConfigured = false; // deprecated; kept to avoid accidental reuse
    this.schemas = [];
    this.selectedSchema = '';
    this.loadingSchemas = false;
    this.schemaError = null;
    this.showSchemaDialog = false;
    this._previouslyFocused = null;
    this._onFormChangeDebounced = null;
    this._pagePath = '';
    this._selectedSchemaName = '';
    this._context = {};
    this._services = null;
  }

  /** Lifecycle: attach styles, initialize services, and bootstrap the UI. */
  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, formContentStyles, formGroupsStyles, formInputsStyles, formNavigationStyles];

    // init DA SDK context
    const { context } = await DA_SDK;
    this._context = { ...context };
    this._services = new ServiceContainer(this._context);
    this._context.services = this._services;

    // Resolve merged project config using ConfigService (sheet + URL + derived)
    const projectConfig = await this._services.config.getProjectConfig(this._context);
    console.log('cfg', projectConfig);
    let pagePath = projectConfig.pagePath;
    this._storageVersion = projectConfig.storageVersion;
    this._allowLocalSchemas = projectConfig.allowLocalSchemas;
    this._localSchemas = projectConfig.localSchemas;
    // Expose config to context for downstream consumers (form-mount)
    this._context.config = projectConfig;

    if (!pagePath) {
      this.error = 'Missing required "page" query parameter. Please provide a page path.';
      return;
    }

    // Load document data before initial render
    await this.loadDocumentData(pagePath);
    this._pagePath = pagePath;
    const savedSchemaId = this.documentData?.schemaId || '';

    // Prepare Form UI (styles), and discover schemas for selection via services
    await this.discoverSchemas();
    // If schema saved in document and is valid, auto-load and skip dialog
    if (savedSchemaId && this.schemas.some((s) => s.id === savedSchemaId)) {
      this.selectedSchema = savedSchemaId;
      await this.loadSelectedSchema();
      this.showSchemaDialog = false;
    } else {
      // Open dialog when schemas are ready
      this.showSchemaDialog = true;
    }

    this.addEventListener('editor-save', this._handleSave);
    this.addEventListener('editor-preview-publish', this._handlePreviewPublish);

    // Ensure toast component is available
    try { await import('./components/toast/toast.js'); } catch { }
  }

  /** Fetch and parse the page document into editor state. */
  async loadDocumentData(pagePath) {
    try {
      this.loading = true;
      this.documentData = await this._services.backend.readDocument(pagePath, { storageVersion: this._storageVersion });
    } catch (error) {
      this.error = `Failed to load document: ${error.message}`;
      console.error('Error loading document:', error);
    } finally {
      this.loading = false;
    }
  }

  /** Discover available schemas from remote and (optional) local sources. */
  async discoverSchemas() {
    try {
      this.loadingSchemas = true;
      this.schemaError = null;
      const remote = await this._services.schemaLoader.getSchemasList();
      // Merge in local schemas using LocalSchemaService (editor decides based on URL flags)
      let locals = [];
      try {
        const allowDefaults = !!this._allowLocalSchemas;
        const explicitList = Array.isArray(this._localSchemas) ? this._localSchemas : [];
        locals = await this._services.localSchema.discoverSchemas({ allowDefaults, explicitList });
      } catch { }
      const merged = Array.isArray(remote) ? [...remote] : [];
      for (const ls of locals) {
        const id = `local:${ls.id || ls.name || ls.url}`;
        merged.push({ id, name: `${ls.name || ls.id || 'Local Schema'} (local)`, url: ls.url, _source: 'local' });
      }
      this.schemas = merged;
      // Preselect first if available, but do not auto-load
      this.selectedSchema = this.schemas[0]?.id || '';
    } catch (e) {
      this.schemaError = e?.message || String(e);
      this.schemas = [];
      this.selectedSchema = '';
    } finally {
      this.loadingSchemas = false;
    }
  }

  /** Load the selected schema, mount or update the Form UI, and sync state. */
  async loadSelectedSchema() {
    const schemaId = this.selectedSchema;
    const mountEl = this.renderRoot?.querySelector('#form-root');
    if (!schemaId || !mountEl) return;
    try {
      const selected = this.schemas.find((s) => s.id === schemaId) || {};
      let schema;
      let initialData = {};
      if (selected.url) {
        // Load local schema via LocalSchemaService
        schema = await this._services.localSchema.loadSchemaByUrl(selected.url);
      } else {
        // Load from default manifest-backed source via service
        const loaded = await this._services.schemaLoader.loadSchemaWithDefaults(schemaId);
        schema = loaded.schema; initialData = loaded.initialData;
      }

      this._selectedSchemaName = selected.name || schema?.title || schemaId;
      // Prefer existing form data from the loaded page if present
      const dataToUse = (this.documentData && this.documentData.formData)
        ? this.documentData.formData
        : initialData;
      if (!this._formApi) {
        // Debounced sync function
        if (!this._onFormChangeDebounced) {
          this._onFormChangeDebounced = this._debounce((next) => {
            const updated = { ...(this.documentData || {}), formData: next, schemaId };
            this.documentData = updated;
          }, 200);
        }

        this._formApi = mountFormUI(this._context, {
          mount: mountEl,
          schema,
          data: dataToUse,
          ui: {},
          onChange: (next) => {
            // Sync live changes back to pageData.formData (debounced)
            this._onFormChangeDebounced(next);
          },
          onRemove: () => {
            try { this._formApi?.destroy(); } catch { }
            this._formApi = null;
            if (this.documentData) {
              const { formData, ...rest } = this.documentData;
              this.documentData = { ...rest };
            }
          },
        });

        // Listen to validation state events to toggle actions and shortcuts
        const onValidationState = (e) => {
          const total = e?.detail?.totalErrors || 0;
          this._setActionsDisabled(total > 0);
        };
        try { mountEl.removeEventListener('form-validation-state', this._onValidationState); } catch { }
        this._onValidationState = onValidationState;
        mountEl.addEventListener('form-validation-state', onValidationState);

      } else {
        this._formApi.updateSchema(schema);
        this._formApi.updateData(dataToUse);
      }
      // Ensure the page data reflects the current form state immediately
      this.documentData = { ...(this.documentData || {}), formData: dataToUse, schemaId };
      // Close dialog after successful load
      this.showSchemaDialog = false;
      // Do not reflect schema in URL anymore
    } catch (e) {
      console.error('[editor] loadSelectedSchema error:', e);
      this.schemaError = `Failed to load schema: ${e?.message || e}`;
    }
  }

  /** Handle schema selection changes from the dialog. */
  onSchemaChange(e) {
    this.selectedSchema = e.target?.value || '';
  }

  /** Lifecycle: cleanup mounted form and event listeners. */
  disconnectedCallback() {
    try { this._formApi?.destroy(); } catch { }
    this._formApi = null;
    this._disableDialogFocusTrap();
    window.removeEventListener('keydown', this._onGlobalKeydown);
    try { this.renderRoot?.querySelector('#form-root')?.removeEventListener('form-validation-state', this._onValidationState); } catch { }
    super.disconnectedCallback();
  }

  /** Setup global keyboard shortcuts (e.g., Cmd/Ctrl+S to save). */
  firstUpdated() {
    // Global shortcuts
    this._onGlobalKeydown = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // Allow save via shortcut even if there are validation errors (testing)
        this._emitSave();
      }
    };
    window.addEventListener('keydown', this._onGlobalKeydown);
  }

  /** Maintain focus trapping for the modal dialog when shown. */
  updated(changed) {
    if (changed.has('showSchemaDialog')) {
      if (this.showSchemaDialog) {
        this._previouslyFocused = this.shadowRoot.activeElement || document.activeElement;
        const dialog = this.renderRoot?.querySelector('.modal-dialog');
        const select = this.renderRoot?.querySelector('#schema-select');
        if (select) select.focus();
        this._enableDialogFocusTrap(dialog);
      } else {
        this._disableDialogFocusTrap();
        if (this._previouslyFocused && typeof this._previouslyFocused.focus === 'function') {
          try { this._previouslyFocused.focus(); } catch { }
        }
      }
    }
  }

  /** Enable focus trap within modal dialog and handle Esc/Enter/Tab keys. */
  _enableDialogFocusTrap(dialog) {
    if (!dialog) return;
    const overlay = this.renderRoot?.querySelector('.modal-overlay');
    const focusable = () => Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.hasAttribute('disabled'));
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.showSchemaDialog = false;
        return;
      }
      if (e.key === 'Enter') {
        if (document.activeElement && document.activeElement.tagName === 'SELECT') {
          e.preventDefault();
          this.loadSelectedSchema();
          return;
        }
      }
      if (e.key === 'Tab') {
        const nodes = focusable();
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    this._dialogKeyHandler = keyHandler;
    overlay?.addEventListener('keydown', keyHandler);
  }

  /** Remove dialog focus trap listeners. */
  _disableDialogFocusTrap() {
    const overlay = this.renderRoot?.querySelector('.modal-overlay');
    if (overlay && this._dialogKeyHandler) {
      overlay.removeEventListener('keydown', this._dialogKeyHandler);
      this._dialogKeyHandler = null;
    }
  }

  /** Utility: debounce a function by `wait` ms. */
  _debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /** Dispatch an editor-save event with current page path and form details. */
  _emitSave() {
    const formMeta = {
      title: this.documentData?.title || '',
      schemaId: this.documentData?.schemaId || this.selectedSchema || '',
    };
    const detail = {
      pagePath: this._pagePath,
      formMeta,
      formData: this.documentData?.formData || null,
    };
    this.dispatchEvent(new CustomEvent('editor-save', { detail }));
  }

  /** Compute path details used by the UI header component. */
  _getPathDetails() {
    const { org, repo, ref } = this._context || {};
    const parentPath = this._pagePath.split('/').slice(0, -1).join('/');
    const parentName = parentPath.split('/').pop();
    const name = this._pagePath.split('/').pop();
    return {
      owner: org,
      repo,
      ref: ref,
      parent: `${DA_LIVE}/#/${org}/${repo}${parentPath}`,
      parentName,
      name
    }
  }

  /** Show a user-facing error and clear any sending state on the action button. */
  handleError(err, action = 'operation', location) {
    try {
      const message = err?.error?.message || err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      console.error('[forms-editor] ' + action + ' error:', err);
      this.error = `Failed to ${action}: ${message}`;
    } catch (e) {
      // ignore
    } finally {
      if (location && location.classList) {
        location.classList.remove('is-sending');
      }
    }
  }

  /** Enable/disable title action buttons based on validation state. */
  _setActionsDisabled(disabled) {
    try {
      const title = this.renderRoot?.querySelector('da-title');
      if (!title) return;
      const root = title.shadowRoot;
      if (!root) return;
      // Reflect error state on the component, avoid disabling action buttons directly
      title.hasErrors = !!disabled;
      // Color the send button when errors exist
      const send = root.querySelector('.da-title-action-send');
      if (send) send.classList.toggle('is-error', !!disabled);
    } catch { }
  }

  /** Save handler: serialize current form to DA. */
  async _handleSave(e) {
    const resp = await this._services.backend.saveDocument(e.detail, { storageVersion: this._storageVersion });
    if (!resp?.ok) {
      this.handleError(resp, 'save');
    }
  }

  /** Preview/Publish handler: save to DA, then trigger AEM actions. */
  async _handlePreviewPublish(e) {
    const { action, location } = e.detail;
    const { org, repo } = this._context;

    location.classList.add("is-sending");

    if (action === "preview" || action === "publish") {
      const formMeta = {
        title: this.documentData?.title || '',
        schemaId: this.documentData?.schemaId || this.selectedSchema || '',
      };
      const detail = {
        pagePath: this._pagePath,
        formMeta,
        formData: this.documentData?.formData || null,
      };
      const daResp = await this._services.backend.saveDocument(detail, { storageVersion: this._storageVersion });
      if (daResp.error) {
        this.handleError(daResp, action, location);
        return;
      }

      const aemPath = `/${org}/${repo}${this._pagePath}`;
      let json = await this._services.backend.saveToAem(aemPath, "preview");
      if (json.error) {
        this.handleError(json, action, location);
        return;
      }
      if (action === "publish") {
        json = await this._services.backend.saveToAem(aemPath, "live");
        if (json.error) {
          this.handleError(json, action, location);
          return;
        }
        this._services.backend.saveDaVersion(aemPath);
      }

      const toOpenInAem = `${MHAST_LIVE}${aemPath}?head=false&schema=true${action === "preview" ? "&preview=true" : ""}`;
      window.open(toOpenInAem, '_blank');
    }
    location.classList.remove("is-sending");
  }

  render() {
    if (this.error) {
      return html`
        <div style="color: red; padding: 20px; border: 1px solid red; border-radius: 4px;">
          <h3>Error</h3>
          <p>${this.error}</p>
          <p>Example URL: <code>?page=/forms/contact</code></p>
        </div>
      `;
    }

    if (this.loading) {
      return html`<div>Loading document data...</div>`;
    }

    if (!this.documentData) {
      return html`<div>No document data available</div>`;
    }

    return html`
      <da-title details=${JSON.stringify(this._getPathDetails())}></da-title>
      <div>
        ${this.showSchemaDialog ? html`
          <div class="modal-overlay" role="dialog" aria-modal="true">
            <div class="modal-dialog">
              <div class="modal-header">Select a Form Schema</div>
              <div class="modal-body">
                <label for="schema-select" style="min-width:72px;">Schema</label>
                <select id="schema-select" style="flex:1;" @change=${(e) => this.onSchemaChange(e)}>
                  ${this.loadingSchemas ? html`<option value="">-- loading --</option>` : nothing}
                  ${!this.loadingSchemas && this.schemas.length === 0 ? html`<option value="">-- no schemas --</option>` : nothing}
                  ${this.schemas.map((it) => html`<option value=${it.id} ?selected=${it.id === this.selectedSchema}>${it.name}</option>`)}
                </select>
              </div>
              ${this.schemaError ? html`<div style="color:#b00020; margin: -4px 0 10px 0;">${this.schemaError}</div>` : nothing}
              <div class="modal-footer">
                <button class="btn btn-secondary" @click=${() => { this.showSchemaDialog = false; }}>Cancel</button>
                <button class="btn btn-primary" @click=${() => this.loadSelectedSchema()} ?disabled=${!this.selectedSchema}>Continue</button>
              </div>
            </div>
          </div>
        ` : nothing}

        ${nothing}
        <div id="form-root"></div>

        <h2>Document Data</h2>
        <textarea 
          readonly 
          rows="20" 
          cols="80" 
          style="width: 100%; font-family: monospace; padding: 10px;"
        >${JSON.stringify(this.documentData, null, 2)}</textarea>
      </div>
    `;
  }
}

customElements.define("da-forms-editor", FormsEditor);
