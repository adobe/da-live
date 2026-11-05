import { LitElement, html, nothing } from 'da-lit';

import { createEngine } from '../../deps/da-sc-sdk/dist/index.js';
import { getNx2 } from '../../scripts/utils.js';
import { createAssetSources } from './assets/sources.js';
import { loadFormContext } from './utils/context.js';
import { attachPersistence } from './utils/persistence.js';
import { loadPreviewOrigin } from './utils/preview.js';
import { isJsonPreviewEnabled } from './utils/config.js';

import './views/editor.js';
import './views/preview.js';
import './views/sidebar.js';
// Fields the shell renders directly (schema selector + messages); the editor
// imports the rest.
import './fields/button.js';
import './fields/picker.js';

const { hashChange, loadStyle } = await import(`${getNx2()}/utils/utils.js`);

/** The stylesheet of the form, adopted by its shadow root. */
const style = await loadStyle(import.meta.url);

/** The tag name the form is registered as. */
const ELEMENT_NAME = 'nx-form';

/** Matches the slashes a locator path starts with. */
const LEADING_SLASHES = /^\/+/;

/** The extension of the DA source document behind a form. */
const HTML_EXTENSION = '.html';

/** The pointer of the document's data, which is selected when a form starts. */
const DATA_POINTER = '/data';

/** The nx2 module that reads the site's AEM Assets repository configuration. */
const REPOSITORY_CONFIG_MODULE = `${getNx2()}/utils/aem-assets/repository-config.js`;

/** The form statuses that edit or pick a schema, so asset fields can appear. */
const ASSET_CONTEXT_STATUSES = new Set(['ready', 'select-schema']);

/** The da.live origin the form links back to. */
const DA_ORIGIN = 'https://da.live';

/** The da.live schema editor, which authors open to create or fix schemas. */
const SCHEMA_EDITOR_URL = `${DA_ORIGIN}/apps/schema`;

/**
 * Derives the legacy `details` shape the form utils expect from the EW supplied `ctx`. The
 * DA source is the `.html` document at `ctx.path`. `parent` and `name` match the upload
 * context Canvas uses.
 * @param {{ org?: string, repo?: string, path?: string }} [context] The editor context,
 *   where `path` is the full `org/site/path` locator.
 * @returns {object|null} The document details, or null when the context is incomplete.
 */
function detailsFromContext(context) {
  if (!context?.org || !context?.repo || !context?.path) {
    return null;
  }

  const absolutePath = `/${String(context.path).replace(LEADING_SLASHES, '')}`;
  const fullpath = absolutePath.toLowerCase().endsWith(HTML_EXTENSION)
    ? absolutePath
    : `${absolutePath}${HTML_EXTENSION}`;
  const separatorIndex = fullpath.lastIndexOf('/');
  return {
    owner: context.org,
    repo: context.repo,
    parent: fullpath.slice(0, separatorIndex),
    name: fullpath.slice(separatorIndex + 1, -HTML_EXTENSION.length),
    fullpath,
    sourceUrl: fullpath,
  };
}

/**
 * Converts the state `hashChange` emits, `{ org, site, path, fullpath }`, into the
 * element's `ctx`, `{ org, repo, path }` with `path` as the full `org/site/path` locator.
 * @param {{ org?: string, site?: string, path?: string, fullpath?: string }} [state] The
 *   hash state.
 * @returns {{ org: string, repo: string, path: string }|null} The editor context, or null
 *   when the hash names no document.
 */
function contextFromHashState(state) {
  if (!state?.org || !state?.site || !state?.path) {
    return null;
  }
  return { org: state.org, repo: state.site, path: state.fullpath.slice(1) };
}

/**
 * Loads the site's AEM Assets configuration and the asset sources it allows. Without a
 * usable configuration the form offers Upload only.
 * @param {object} options The document to load the sources for.
 * @param {object} options.details The document details, see `detailsFromContext`.
 * @param {() => boolean} options.isCurrent Whether the document is still the one loaded.
 * @returns {Promise<{ repositoryConfig: object|null, sources: object[] }>} The
 *   configuration, null when unavailable, and the sources, see `createAssetSources`.
 */
async function loadAssetSources({ details, isCurrent }) {
  try {
    const { getRepositoryConfig } = await import(REPOSITORY_CONFIG_MODULE);
    const repositoryConfig = await getRepositoryConfig(details.owner, details.repo);
    return {
      repositoryConfig,
      sources: createAssetSources({ details, repositoryConfig, isCurrent }),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('AEM Assets configuration unavailable. Offering Upload only.', error);
    return { repositoryConfig: null, sources: createAssetSources({ details, isCurrent }) };
  }
}

/**
 * The structured content form of a DA document. It loads the document's schema and
 * content, renders the editor, preview and sidebar, and saves every change.
 * @property {{ org: string, repo: string, path: string }} [ctx] The editor context, where
 *   `path` is the full `org/site/path` locator. The Experience Workspace host sets it, and
 *   `startRouting` derives it from the hash when the form runs standalone.
 */
class Form extends LitElement {
  static properties = {
    ctx: { attribute: false },

    _context: { state: true },
    _state: { state: true },
    _navigation: { state: true },
    _pendingSchemaId: { state: true },
    _previewEnabled: { state: true },

    _assetSources: { state: true },
    _previewOrigin: { state: true },
  };

  // Reactive properties (declared in static properties) must NOT have class-
  // field initializers — they would shadow Lit's reactive setter. See
  // https://lit.dev/docs/components/properties/#avoiding-issues-with-class-fields

  /** Counts context loads, so results of an older load are ignored. */
  _loadVersion = 0;

  /** The details of the loaded document, see `detailsFromContext`. */
  _details = null;

  /** The site's AEM Assets repository configuration, or null when unavailable. */
  _repositoryConfig = null;

  /** The engine of the loaded document, see `createEngine`. */
  _editor = null;

  /** Saves the document on change, see `attachPersistence`. */
  _persistence = null;

  /** Stops the hash subscription of standalone routing. */
  _unsubscribe = null;

  /**
   * Re-renders on every engine state change. The engine has a single onChange slot, used
   * here for Lit reactivity, so the notification is forwarded to the persistence, which
   * saves when the document has actually changed.
   */
  _onChange = () => {
    if (!this._editor) {
      return;
    }

    this._state = this._editor.getState();
    this._persistence?.notify();
  };

  /**
   * Selects a field. The counter changes on every selection, so selecting the same field
   * again still scrolls to it.
   * @param {string} pointer The JSON pointer of the field.
   * @param {string|null} [origin] The view that made the selection, `editor` or `sidebar`.
   */
  _onSelect = (pointer, origin = null) => {
    if (!pointer) {
      return;
    }

    this._navigation = {
      pointer,
      origin,
      seq: (this._navigation?.seq ?? 0) + 1,
    };
  };

  /** Adopts the form stylesheet once the shadow root exists. */
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  /** Stops routing and saving when the form leaves the page. */
  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._persistence?.detach();
    this._persistence = null;
    super.disconnectedCallback();
  }

  /**
   * Subscribes the element's own `ctx` to the hash for standalone, nx2 served routing. The
   * Experience Workspace host pushes `ctx` directly instead and never calls this.
   */
  startRouting() {
    this._unsubscribe?.();
    this._unsubscribe = hashChange.subscribe((state) => {
      const context = contextFromHashState(state);
      if (context) {
        this.ctx = context;
      }
    });
  }

  /**
   * Loads the document whenever the editor context changes.
   * @param {Map<string, unknown>} changedProperties The properties that changed, with their
   *   previous values.
   */
  updated(changedProperties) {
    if (changedProperties.has('ctx')) {
      this._loadContext();
    }
  }

  /**
   * Starts editing a document with its schema. Persistence attaches after the load, so the
   * loaded document is its baseline: later mutations save, the load itself does not.
   * @param {object} options The document to edit.
   * @param {object} options.schema The JSON schema of the document.
   * @param {object} options.json The document content.
   */
  _start({ schema, json }) {
    this._editor = createEngine({ schema, document: json, onChange: this._onChange });
    // Seeded rows run before persistence attaches, so they are part of the baseline and
    // do not save. Empty rows do not count toward minItems and are pruned on save.
    this._seedRequiredArrays();
    this._state = this._editor.getState();
    // Like Canvas, AEM images are saved as links when the site sets
    // `aem.assets.image.type` to `link`. The configuration is read on every save, because
    // it loads after the form starts.
    this._persistence = attachPersistence(this._editor, {
      path: this._details?.fullpath,
      getConfig: () => ({ externalImagesAsLinks: this._repositoryConfig?.insertAsLink === true }),
    });
    this._navigation = { pointer: DATA_POINTER, origin: null, seq: 0 };
  }

  /**
   * Adds empty rows to required arrays as a UI convenience, so authors see a row to fill
   * in. The SDK never seeds. Object groups are searched recursively, array items are not,
   * because they are dynamic and start empty.
   */
  _seedRequiredArrays() {
    /**
     * Seeds the rows of a required array, or searches the fields of an object.
     * @param {object} [node] A node of the engine's model.
     */
    const seed = (node) => {
      if (!node) {
        return;
      }

      if (node.kind === 'array' && node.required) {
        const targetCount = Math.max(node.minItems ?? 0, 1);
        const existingCount = node.items?.length ?? 0;
        for (let count = existingCount; count < targetCount; count += 1) {
          this._editor.addItem(node.pointer);
        }
      } else if (node.kind === 'object' && Array.isArray(node.children)) {
        node.children.forEach(seed);
      }
    };
    seed(this._editor.getState().model.root);
  }

  /**
   * Resets the form and loads the document of the current context, its schemas and
   * whether the JSON preview is enabled. A newer load supersedes this one.
   * @returns {Promise<void>} Settles once the document and its asset sources are loaded.
   */
  async _loadContext() {
    this._loadVersion += 1;
    const version = this._loadVersion;
    this._pendingSchemaId = '';
    this._state = null;
    this._editor = null;
    this._persistence?.detach();
    this._persistence = null;

    this._assetSources = undefined;
    this._previewOrigin = undefined;
    this._repositoryConfig = null;

    this._details = detailsFromContext(this.ctx);

    if (!this._details) {
      this._context = undefined;
      return;
    }

    this._context = { status: 'loading', schemas: {} };

    const [context, previewEnabled] = await Promise.all([
      loadFormContext({ details: this._details }),
      isJsonPreviewEnabled({ org: this.ctx.org, site: this.ctx.repo }),
    ]);
    if (version !== this._loadVersion) {
      return;
    }

    this._previewEnabled = previewEnabled;
    this._context = context;
    if (context.status === 'ready') {
      this._start({ schema: context.schema, json: context.json });
    }

    if (ASSET_CONTEXT_STATUSES.has(context.status)) {
      await this._loadAssetContext(version);
    }
  }

  /**
   * Loads the asset sources and the preview origin of the document. They load
   * independently, so a slow preview login never delays the sources.
   * @param {number} version The load version the context belongs to.
   * @returns {Promise<void>} Settles once the sources are loaded.
   */
  async _loadAssetContext(version) {
    const { owner, repo } = this._details;
    /** Answers whether the load is still the latest one. */
    const isCurrent = () => version === this._loadVersion;

    loadPreviewOrigin({ owner, repo }).then((previewOrigin) => {
      if (isCurrent()) {
        this._previewOrigin = previewOrigin;
      }
    });

    const { repositoryConfig, sources } = await loadAssetSources({
      details: this._details,
      isCurrent,
    });
    if (isCurrent()) {
      this._repositoryConfig = repositoryConfig;
      this._assetSources = sources;
    }
  }

  /**
   * Remembers the schema the author picked, until they create the document with it.
   * @param {Event} event The schema picker's `change` event.
   */
  _onPendingSchemaChange(event) {
    this._pendingSchemaId = event.currentTarget?.value ?? '';
  }

  /**
   * Starts a new document with the picked schema, its title set to the document name.
   * @returns {Promise<void>} Settles once the document is started.
   */
  async _applySelectedSchema() {
    const schemaName = this._pendingSchemaId;
    const schema = this._context?.schemas?.[schemaName];
    if (!schema || !schemaName) {
      return;
    }

    const json = {
      metadata: {
        title: this._details?.name ?? '',
        schemaName,
      },
      data: {},
    };

    this._context = {
      ...this._context,
      status: 'ready',
      schemaName,
      schema,
      json,
    };

    this._start({ schema, json });
  }

  /**
   * Links to the da.live schema editor of the site.
   * TODO(EW): cross-app nav to the da.live schema editor. Revisit if EW should own schema
   * authoring rather than linking out.
   * @returns {string} The schema editor URL, for the site when it is known.
   */
  _schemaEditorHref() {
    const { owner, repo } = this._details ?? {};
    if (!owner || !repo) {
      return SCHEMA_EDITOR_URL;
    }
    return `${SCHEMA_EDITOR_URL}#/${owner}/${repo}`;
  }

  /**
   * Navigates to the da.live home of the site, keeping the current query.
   * TODO(EW): cross-app nav back to the da.live home. Revisit if EW should provide its own
   * "home" target.
   */
  _goHome() {
    const { owner, repo } = this._details ?? {};
    if (!owner || !repo) {
      return;
    }

    const query = window.location.search ?? '';
    window.location.href = `${DA_ORIGIN}${query}#/${owner}/${repo}`;
  }

  /**
   * Centers content in the form area.
   * @param {import('da-lit').TemplateResult} content The content to center.
   * @returns {import('da-lit').TemplateResult} The centered content.
   */
  _renderCentered(content) {
    return html`
      <div class="nx-form-wrapper nx-form-wrapper-centered">
        ${content}
      </div>
    `;
  }

  /**
   * Renders a centered message, such as why the document cannot be opened.
   * @param {string} [title] The message heading.
   * @param {string|import('da-lit').TemplateResult} body The message text.
   * @param {object} [options] The message settings.
   * @param {boolean} [options.showHomeAction] Whether a button leads back to the da.live
   *   home.
   * @returns {import('da-lit').TemplateResult} The message.
   */
  _renderMessage(title, body, { showHomeAction = false } = {}) {
    return this._renderCentered(html`
      <div class="nx-form-schema-shell">
        <section class="nx-form-message">
          ${title ? html`<h2>${title}</h2>` : nothing}
          <p>${body}</p>
          ${showHomeAction ? html`
            <div class="nx-form-actions">
              <form-button
                variant="secondary"
                @click=${() => this._goHome()}
              >Return to Home</form-button>
            </div>
          ` : nothing}
        </section>
      </div>
    `);
  }

  /**
   * Explains why the document cannot be opened, by the blocker the context reports.
   * @returns {import('da-lit').TemplateResult} The message.
   */
  _renderBlocked() {
    const { blocker = {}, displayPath } = this._context ?? {};
    const schemaEditorHref = this._schemaEditorHref();

    let title = 'Unable to open';
    let body = html`This resource could not be opened.`;

    if (blocker.type === 'missing-schema') {
      const schemaName = blocker.schemaName || '(empty)';
      title = 'Schema not found';
      body = html`
        No schema named <strong>${schemaName}</strong>.
        <a
          class="nx-form-schema-text-link"
          href=${schemaEditorHref}
          target="_blank"
          rel="noopener noreferrer"
        >Open Schema Editor</a>
      `;
    } else if (blocker.type === 'not-document' || blocker.type === 'not-form-content') {
      title = 'Unsupported resource';
      body = html`
        This resource${displayPath ? html` at <strong>${displayPath}</strong>` : nothing}
        is not Structured Content.
      `;
    } else if (blocker.type === 'no-access') {
      title = 'Access denied';
      body = html`
        You do not have access to this resource${displayPath ? html` at <strong>${displayPath}</strong>` : nothing}.
      `;
    } else if (blocker.type === 'load-failed') {
      title = 'Unable to load';
      body = html`This resource could not be loaded. Try again later.`;
    }

    return this._renderMessage(title, body);
  }

  /**
   * Renders the picker that starts a new document with one of the site's schemas.
   * @returns {import('da-lit').TemplateResult} The schema picker.
   */
  _renderSchemaSelector() {
    const schemas = this._context?.schemas ?? {};
    const schemaEditorHref = this._schemaEditorHref();

    return html`
      <div class="nx-form-schema-shell">
        <h2 class="nx-form-schema-heading">Choose a schema</h2>
        <div class="nx-form-schema-form">
          <div class="nx-form-schema-select-group">
            <form-picker
              hoist
              class="nx-form-schema-select"
              label="Schema"
              placeholder="Select a schema"
              .value=${this._pendingSchemaId ?? ''}
              @change=${this._onPendingSchemaChange}
            >
              <option value="">Select a schema</option>
              ${Object.entries(schemas).map(([id, schema]) => html`
                <option value="${id}">${schema?.title ?? id}</option>
              `)}
            </form-picker>
            <p class="nx-form-schema-hint">
              To create a new schema, open
              <a
                class="nx-form-schema-text-link"
                href=${schemaEditorHref}
                target="_blank"
                rel="noopener noreferrer"
              >Schema Editor</a>.
            </p>
          </div>
          <form-button
            variant="accent"
            class="nx-form-schema-start"
            ?disabled=${!this._pendingSchemaId}
            @click=${this._applySelectedSchema}
          >Create</form-button>
        </div>
      </div>
    `;
  }

  /**
   * Asks the author to create a schema first, because the site has none.
   * @returns {import('da-lit').TemplateResult} The message.
   */
  _renderNoSchemas() {
    return html`
      <div class="nx-form-schema-shell">
        <div class="nx-form-schema-card">
          <p class="nx-form-title">Please create a schema</p>
          <p class="nx-form-schema-hint">
            This project has no schemas yet. Open the schema editor to add one, then return here.
          </p>
          <div class="nx-form-schema-field nx-form-schema-field-link">
            <a
              class="nx-form-schema-cta"
              href=${this._schemaEditorHref()}
              target="_blank"
              rel="noopener noreferrer"
            >Open Schema Editor</a>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the editor, the optional preview and the sidebar of a started document.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The form, a message when the
   *   document has no structured content, or nothing before the engine starts.
   */
  _renderReady() {
    if (!this._state) {
      return nothing;
    }

    const root = this._state?.model?.root;
    if (!root) {
      return this._renderMessage(
        'Unavailable',
        'Structured content is unavailable for this document.',
        { showHomeAction: true },
      );
    }

    const showPreview = this._previewEnabled !== false;

    return html`
      <div class="nx-form-wrapper">
        <div class="nx-editor-pane ${showPreview ? 'nx-editor-pane-with-preview' : ''}">
          <nx-editor
            .editor=${this._editor}
            .state=${this._state}
            .nav=${this._navigation}
            .onSelect=${this._onSelect}
            .assetSources=${this._assetSources}
            .previewOrigin=${this._previewOrigin}
          ></nx-editor>
          ${showPreview ? html`<nx-preview .state=${this._state}></nx-preview>` : nothing}
        </div>
        <nx-sidebar
          .state=${this._state}
          .nav=${this._navigation}
          .onSelect=${this._onSelect}
        ></nx-sidebar>
      </div>
    `;
  }

  /**
   * Renders the view of the current load status.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The view, or nothing without
   *   a context or while loading.
   */
  render() {
    if (!this.ctx) {
      return nothing;
    }

    const { status } = this._context ?? {};
    if (!status || status === 'loading') {
      return nothing;
    }
    if (status === 'blocked') {
      return this._renderBlocked();
    }
    if (status === 'select-schema') {
      return this._renderCentered(this._renderSchemaSelector());
    }
    if (status === 'no-schemas') {
      return this._renderCentered(this._renderNoSchemas());
    }
    if (status === 'ready') {
      return this._renderReady();
    }

    return nothing;
  }
}

if (!customElements.get(ELEMENT_NAME)) {
  customElements.define(ELEMENT_NAME, Form);
}

/**
 * Mounts the ctx-driven `nx-form` element and feeds it the hash. The wrapper, form.js,
 * calls this after setting up the surrounding workspace.
 * @param {HTMLElement} block The form block.
 */
export default function decorate(block) {
  const nxForm = document.createElement(ELEMENT_NAME);
  block.append(nxForm);
  nxForm.startRouting();
}
