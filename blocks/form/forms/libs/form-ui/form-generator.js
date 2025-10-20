/**
 * JSON Schema-driven Form Generator
 * Generates form UI from a JSON Schema.
 *
 * Responsibilities:
 * - Orchestrate schema→DOM rendering (header/body/footer)
 * - Build sections and groups via GroupBuilder
 * - Create controls via InputFactory and wire events
 * - Maintain data via FormUiModel
 * - Plug features: Navigation, Validation
 * - Expose maps/refs for features:
 *   groupElements, fieldSchemas, fieldElements, fieldToGroup, navigationTree
 */

import FormValidation from './features/validation.js';
import FormNavigation from './features/navigation.js';
import FormDataModel from './form-data-model.js';
import InputFactory from './input-factory.js';
import GroupBuilder from './form-generator/group-builder.js';
import HighlightOverlay from './features/highlight-overlay.js';
import getControlElement, { isElementScrollableY, findNearestScrollableAncestor } from './utils/dom-utils.js';
import { renderField } from './renderers/field-renderer.js';
import { generateForm as lifecycleGenerateForm, rebuildBody as lifecycleRebuildBody } from './form-generator/lifecycle.js';
import createFormCommands from './commands/form-commands.js';
import { hyphenatePath as utilHyphenatePath, pathToGroupId as utilPathToGroupId, arrayItemId as utilArrayItemId } from './form-generator/path-utils.js';
import createArrayGroupUI from './form-generator/input-array-group.js';

/**
 * FormGenerator
 *
 * Central orchestrator that renders a form UI from a JSON Schema and keeps
 * the UI, data model, and feature modules (navigation, validation) in sync.
 *
 * Usage:
 * - Construct with `context`, `schema`
 * - Call `generateForm()` to get the root DOM element
 * - Use command helpers for structural changes (activate optional, add/remove/reorder items)
 * - Use `mountFormUI` for a batteries-included mounting and lifecycle wrapper
 */
export default class FormGenerator {
  /**
   * @param {object} context - Shared services and configuration
   * @param {object} schema - JSON Schema to render
   * @param {{}} [options]
   */
  constructor(context, schema, options = {}) {

    // Use schema as-is; resolve only parts on-demand to avoid deep recursion on large graphs
    this.context = context;
    this.services = context.services;
    this.schema = schema;
    this.renderAllGroups = true;
    // Data model
    this.model = new FormDataModel(this.context, this.schema);
    // Start with empty data; base defaults are only used when no saved data exists
    this.data = {};
    // Derived groups model (read-only)
    this.formUiModel = this.services.formUiModel.createFormUiModel({ schema: this.schema, data: this.data });
    this.listeners = new Set();
    this.groupCounter = 0;
    this.groupElements = new Map();
    this.activeSchemaPath = '';
    this.navigationTree = null;
    this.fieldErrors = new Map();
    this.groupErrors = new Map();
    this.fieldSchemas = new Map();
    this.fieldElements = new Map();
    this.fieldToGroup = new Map();

    // Initialize validation and navigation
    this.validation = new FormValidation(this.context, this);
    this.navigation = new FormNavigation(this.context, this);

    // Input factory with injected handlers to preserve behavior
    this.inputFactory = new InputFactory(this.context, {
      onInputOrChange: (fieldPath, propSchema, inputEl) => {
        this.updateData();
        this.validation.validateField(fieldPath, propSchema, inputEl);
      },
      onBlur: (fieldPath, propSchema, inputEl) => {
        this.validation.validateField(fieldPath, propSchema, inputEl);
      },
      onFocus: (_fieldPath, _schema, target) => {
        this.navigation.highlightActiveGroup(target);
      },
      derefNode: this.derefNode.bind(this),
      getArrayValue: (path) => this.model.getNestedValue(this.data, path),
      onArrayAdd: (path, propSchema) => {
        // Use centralized command for primitive arrays
        const itemSchema = this.derefNode(propSchema.items) || propSchema.items || { type: 'string' };
        // Determine default by type
        let defaultValue = '';
        const type = Array.isArray(itemSchema.type) ? (itemSchema.type.find((t) => t !== 'null') || itemSchema.type[0]) : itemSchema.type;
        if (type === 'number' || type === 'integer') defaultValue = 0;
        if (type === 'boolean') defaultValue = false;
        this.updateData();
        this.model.pushArrayItem(this.data, path, defaultValue);
        this.rebuildBody();
        requestAnimationFrame(() => {
          // After rebuild, re-validate and restore active highlight on the owning group
          try { this.validation.validateAllFields(); } catch { }
          try {
            const groupId = this.fieldToGroup.get(path) || null;
            if (groupId && this.navigation && this.navigation.navigationTree) {
              // Suppress scrollspy briefly to avoid nav jump
              try { this._programmaticScrollUntil = Date.now() + 800; } catch { }
              const exists = this.navigation.navigationTree.querySelector(`[data-group-id="${groupId}"] .form-ui-nav-item-content`);
              if (exists) {
                this.navigation.updateActiveGroup(groupId);
              }
            }
          } catch { }
        });
      },
      onArrayRemove: (path, index) => {
        // Use centralized command for primitive arrays
        this.commandRemoveArrayItem(path, index);
        requestAnimationFrame(() => this.validation.validateAllFields());
      },
    });

    // Group builder delegates DOM structuring
    this.groupBuilder = new GroupBuilder({
      inputFactory: this.inputFactory,
      formatLabel: this.formatLabel.bind(this),
      hasPrimitiveFields: this.hasPrimitiveFields.bind(this),
      generateObjectFields: this.generateObjectFields.bind(this),
      generateInput: this.generateInput.bind(this),
      generateField: this.generateField.bind(this),
      onActivateOptionalGroup: this.onActivateOptionalGroup.bind(this),


      refreshNavigation: () => {
        // Re-map fields to groups and rebuild navigation tree after dynamic insertion
        this.navigation.mapFieldsToGroups();
        if (this.navigationTree) {
          this.navigation.generateNavigationTree();
        }
        // Re-run validation for newly added controls
        this.validation.validateAllFields();
      },
      derefNode: this.derefNode.bind(this),
      getSchemaTitle: this.getSchemaTitle.bind(this),
      normalizeSchema: this.normalizeSchema.bind(this),
      renderAllGroups: this.renderAllGroups,
      schemaService: this.services.schema,
      schema: this.schema,
    });

    // Visual overlay
    this.highlightOverlay = new HighlightOverlay();

    // Compose command API
    this.commands = createFormCommands(this);
  }

  /**
   * Decide if an optional nested object/array should be rendered.
   * Active if explicitly activated or if current data has any value present.
   * @param {string} path
   * @returns {boolean}
   */
  isOptionalGroupActive(path) {
    const cur = this.model.getNestedValue(this.data, path);
    if (Array.isArray(cur)) return cur.length > 0;
    if (cur && typeof cur === 'object') return true;
    return cur != null && cur !== '';
  }

  /**
   * Handler for when an optional group is activated by the user.
   * Initializes data at the path using schema defaults and rebuilds the body.
   * @param {string} path
   * @param {object} schema
   */
  onActivateOptionalGroup(path, schema) {

    // Ensure nested path exists in current data
    const schemaNode = this.normalizeSchema(schema);

    let baseValue = {};
    if (schemaNode) {
      if (schemaNode.type === 'object') {
        // Shallow activation: only create the parent object; do not pre-populate optional children
        baseValue = {};
      } else if (schemaNode.type === 'array') {
        // For arrays, initialize to [] and let add item flows populate
        baseValue = [];
      }
    }

    this.setNestedValue(this.data, path, baseValue);
    // Update presence snapshot so activation reflects in the UI model

    // Notify listeners for data change
    this.listeners.forEach((listener) => listener(this.data));
    // Rebuild the form body to materialize the newly activated group

    const res = this.rebuildBody();

  }

  /** Rebuild the form body while preserving current state and references. */
  rebuildBody() {
    // Recompute the read-only FormUiModel before rebuilding UI
    this.formUiModel = this.services.formUiModel.createFormUiModel({ schema: this.schema, data: this.data });
    return lifecycleRebuildBody(this);
  }

  /**
   * Ensure any groups created via generateField (arrays-of-objects) are registered in groupElements
   */
  /** Ensure newly rendered group elements are present in `groupElements` map. */
  ensureGroupRegistry() {
    // Kept for backward compatibility; lifecycle uses mapping.ensureGroupRegistry
    if (!this.container) return;
    const groups = this.container.querySelectorAll('.form-ui-group[id], .form-ui-array-item[id]');
    groups.forEach((el) => {
      const id = el.id;
      if (!this.groupElements.has(id)) {
        this.groupElements.set(id, {
          element: el,
          path: [],
          title: el.querySelector('.form-ui-group-title')?.textContent || el.querySelector('.form-ui-label')?.textContent || '',
          schemaPath: el.dataset?.schemaPath || '',
          isSection: false,
        });
      }
    });
  }

  /**
   * Resolve a single node shallowly (on-demand) for $ref using local $defs/definitions
   */
  /** Resolve a schema node on-demand using `$ref` against local `$defs`. */
  derefNode(node) { return this.services.schema.derefNode(this.schema, node); }

  /** Get a human-friendly title for a schema property or fall back to key. */
  getSchemaTitle(propSchema, fallbackKey) { return this.services.schema.getSchemaTitle(this.schema, propSchema, fallbackKey || ''); }

  /**
   * Generate form HTML from JSON schema
   */
  /** Generate the complete form (header/body/footer) and return the root element. */
  generateForm() {

    return lifecycleGenerateForm(this);
  }

  /** Return the latest read-only FormUiModel tree. */
  getFormUiModel() {
    return this.formUiModel;
  }

  /**
   * Render fields for the given object properties into `container`.
   * @param {HTMLElement} container
   * @param {object} properties
   * @param {string[]} [required=[]]
   * @param {string} [pathPrefix='']
   */
  generateObjectFields(container, properties, required = [], pathPrefix = '') {
    Object.entries(properties).forEach(([key, originalPropSchema]) => {
      const propSchema = this.derefNode(originalPropSchema) || originalPropSchema;
      const field = this.generateField(key, propSchema, required.includes(key), pathPrefix);
      if (field) {
        container.appendChild(field);
      }
    });
  }

  /**
   * Create a field wrapper for a property and return its DOM element.
   * @param {string} key
   * @param {object} propSchema
   * @param {boolean} [isRequired=false]
   * @param {string} [pathPrefix='']
   */
  generateField(key, propSchema, isRequired = false, pathPrefix = '') {
    return renderField(this, key, propSchema, isRequired, pathPrefix);
  }

  /**
   * Create an input control based on the property schema. Arrays-of-objects
   * are rendered as repeatable object groups via `input-array-group`.
   * @param {string} fieldPath
   * @param {object} propSchema
   */
  generateInput(fieldPath, propSchema) {
    // Special handling: arrays of objects render as repeatable object groups
    if (
      propSchema && propSchema.type === 'array'
      && (propSchema.items && (
        (propSchema.items.type === 'object')
        || (this.derefNode(propSchema.items)?.type === 'object')
        || !!propSchema.items.$ref
      ))
    ) {
      return createArrayGroupUI(this, fieldPath, propSchema);
    }

    // Delegate to factory (events are attached there)
    const input = this.inputFactory.create(fieldPath, propSchema);

    // On blur, factory already validates. We keep the delayed clear to preserve UX
    const controlEl = getControlElement(input);
    if (controlEl) {
      controlEl.addEventListener('blur', () => {
        setTimeout(() => {
          if (!this.navigation.isAnyInputFocusedInActiveGroup()) {
            this.navigation.clearActiveGroupHighlight();
          }
        }, 300);
      });
    }

    return input;
  }

  /** Retrieve a value from an input element using model coercion rules. */
  getInputValue(inputEl) {
    return this.model.getInputValue(inputEl);
  }

  // Input creators live in InputFactory; intentionally centralized to reduce duplication.

  /**
   * Create a default object for an array-of-objects item based on its schema.
   * Required nested objects are initialized; optional ones are omitted.
   */
  createDefaultObjectFromSchema(itemsSchema) {
    const node = this.normalizeSchema(this.derefNode(itemsSchema) || itemsSchema || {});
    if (!node || (node.type !== 'object' && !node.properties)) return {};

    const required = new Set(Array.isArray(node.required) ? node.required : []);
    const out = {};
    Object.entries(node.properties || {}).forEach(([key, prop]) => {
      const eff = this.normalizeSchema(this.derefNode(prop) || prop || {});
      const type = Array.isArray(eff.type) ? (eff.type.find((t) => t !== 'null') || eff.type[0]) : eff.type;
      switch (type) {
        case 'string':
          out[key] = eff.default || '';
          break;
        case 'number':
        case 'integer':
          out[key] = eff.default ?? 0;
          break;
        case 'boolean':
          out[key] = eff.default ?? false;
          break;
        case 'array':
          // safe to initialize as empty; UI won’t show array items until present
          out[key] = Array.isArray(eff.default) ? eff.default : [];
          break;
        case 'object':
        default: {
          const isObjectLike = eff && (eff.type === 'object' || eff.properties);
          if (isObjectLike) {
            if (required.has(key)) {
              // Include required nested objects recursively
              out[key] = this.createDefaultObjectFromSchema(eff);
            } else {
              // Skip optional nested objects so they are not auto-activated
              // Intentionally omit key
            }
          } else if (eff && eff.enum) {
            out[key] = eff.default || '';
          } else {
            out[key] = eff && Object.prototype.hasOwnProperty.call(eff, 'default') ? eff.default : null;
          }
        }
      }
    });
    return out;
  }

  // -----------------------------
  // Path/ID helpers (single source of truth)
  // -----------------------------
  /** Convert a dotted path to a hyphenated token suitable for ids. */
  hyphenatePath(path) { return utilHyphenatePath(path); }
  /** Convert a dotted path to a stable group DOM id. */
  pathToGroupId(path) { return utilPathToGroupId(path); }
  /** Compute the DOM id for an array item group at `index`. */
  arrayItemId(arrayPath, index) { return utilArrayItemId(arrayPath, index); }

  // -----------------------------
  // Schema resolve + command API
  // -----------------------------
  /**
   * Resolve a schema node by dotted path with optional array indices.
   * @param {string} dottedPath
   * @returns {object|null}
   */
  resolveSchemaByPath(dottedPath) {
    const tokens = String(dottedPath || '').split('.');
    let current = this.schema;
    for (const token of tokens) {
      const normalized = this.normalizeSchema(this.derefNode(current) || current);
      if (!normalized) return null;
      const match = token.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = match ? match[1] : token;
      current = normalized?.properties?.[key];
      if (!current) return null;
      const idxPresent = match && typeof match[2] !== 'undefined';
      if (idxPresent) {
        const curNorm = this.normalizeSchema(this.derefNode(current) || current);
        if (!curNorm || curNorm.type !== 'array') return null;
        current = this.derefNode(curNorm.items) || curNorm.items;
        if (!current) return null;
      }
    }
    return current;
  }

  /** Activate a gated optional group at path. */
  commandActivateOptional(path) { this.commands.activateOptional(path); }

  /** Append a new item to an array-of-objects group. */
  commandAddArrayItem(arrayPath) { this.commands.addArrayItem(arrayPath); }

  /** Remove item at `index` from an array-of-objects group. */
  commandRemoveArrayItem(arrayPath, index) { this.commands.removeArrayItem(arrayPath, index); }

  /** Reorder item from `fromIndex` to `toIndex` within an array-of-objects. */
  commandReorderArrayItem(arrayPath, fromIndex, toIndex) { this.commands.reorderArrayItem(arrayPath, fromIndex, toIndex); }

  /** Reset internal state and data to initial base JSON for the schema. */
  commandResetAll() { this.commands.resetAll(); }

  /** Convert a property key into a user-friendly label. */
  formatLabel(name) {
    return this.services.label.formatLabel(name);
  }

  /**
   * Collect values from all inputs and update the internal data object.
   * Preserves base structure, prunes empty primitive array entries, and
   * notifies listeners.
   */
  updateData() {
    const { container } = this;
    if (!container) return;

    // Do not merge base defaults here; keep only user-provided values
    this.data = this.model.deepMerge({}, this.data || {});
    // No separate presence snapshot

    // Collect all form inputs and organize them into nested structure
    const inputs = container.querySelectorAll('input[name], select[name], textarea[name]');

    inputs.forEach((input) => {
      const fieldName = input.name;
      let value;

      // Get the appropriate value based on input type
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        // Preserve emptiness for numeric inputs instead of coercing to 0
        if (input.value === '') {
          value = null;
        } else {
          const parsed = parseFloat(input.value);
          value = Number.isNaN(parsed) ? null : parsed;
        }
      } else {
        value = input.value;
      }

      // Ignore synthetic array helper names like field[]; normalize to plain path
      const normalizedName = fieldName;
      // Set the value in the nested data structure
      this.model.setNestedValue(this.data, normalizedName, value);
    });

    // Post-process: prune empty entries from primitive arrays at any depth
    this.model.prunePrimitiveArrays(this.schema, '', this.data);

    // Keep derived model in sync for features relying on it
    this.formUiModel = this.services.formUiModel.createFormUiModel({ schema: this.schema, data: this.data });

    // Notify listeners
    this.listeners.forEach((listener) => listener(this.data));
  }

  /**
   * Set a value in a nested object structure using dot notation
   */
  /** Set a value inside the data object using dot/bracket notation. */
  setNestedValue(obj, path, value) {
    this.model.setNestedValue(obj, path, value);
  }

  /**
   * Deep merge objects, preserving the base structure
   */
  /** Deep-merge `incoming` into `base`, recursing into objects. */
  deepMerge(base, incoming) {
    return this.model.deepMerge(base, incoming);
  }

  /**
   * Load data into form
   */
  /** Replace current data with `data` and populate inputs accordingly. */
  loadData(data) {
    // Load exact saved data; no base defaults
    this.data = this.deepMerge({}, data || {});
    // Keep derived model in sync for features relying on it
    this.formUiModel = this.services.formUiModel.createFormUiModel({ schema: this.schema, data: this.data });


    if (!this.container) return;

    // Populate form fields recursively
    this.populateFormFields(this.data, '');
  }

  /** Recursively populate inputs from the provided data snapshot. */
  populateFormFields(data, prefix = '') {
    if (data == null) return;

    // Handle arrays of primitives/objects
    if (Array.isArray(data)) {
      data.forEach((item, idx) => {
        const itemPrefix = `${prefix}[${idx}]`;
        if (item && typeof item === 'object') {
          this.populateFormFields(item, itemPrefix);
        } else {
          const field = this.container.querySelector(`[name="${itemPrefix}"]`);
          if (field) {
            if (field.type === 'checkbox') field.checked = Boolean(item);
            else field.value = item || '';
          }
        }
      });
      return;
    }

    // Handle plain primitives bound directly to a name
    if (typeof data !== 'object') {
      if (prefix) {
        const field = this.container.querySelector(`[name="${prefix}"]`);
        if (field) {
          if (field.type === 'checkbox') field.checked = Boolean(data);
          else field.value = data || '';
        }
      }
      return;
    }

    // Handle objects and recurse into arrays/objects
    Object.entries(data).forEach(([key, value]) => {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      const field = this.container.querySelector(`[name="${fieldName}"]`);

      if (field && (value == null || typeof value !== 'object')) {
        if (field.type === 'checkbox') field.checked = Boolean(value);
        else field.value = value || '';
        return;
      }

      if (Array.isArray(value) || (value && typeof value === 'object')) {
        this.populateFormFields(value, fieldName);
      }
    });
  }

  /** Register a data-change listener. */
  onChange(listener) {
    this.listeners.add(listener);
  }

  /** Deregister a data-change listener. */
  offChange(listener) {
    this.listeners.delete(listener);
  }

  /** Return current data as pretty-printed JSON string. */
  getDataAsJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  /** Parse and load data from a JSON string; returns true on success. */
  setDataFromJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.loadData(data);
      // Ensure internal data is updated for listeners
      this.data = this.model.deepMerge({}, data || {});
      this.formUiModel = this.services.formUiModel.createFormUiModel({ schema: this.schema, data: this.data });
      return true;
    } catch (error) {
      // Keep behavior but avoid noisy console in lints; consumers can handle return value
      return false;
    }
  }


  // setupFormChangeListeners removed; input listeners are attached in factories

  /**
   * Returns true if the object `schema` has any primitive properties at this level.
   * Used to decide when to create a concrete group entry.
   */
  hasPrimitiveFields(schema) {
    if (!schema || !schema.properties) return false;

    return Object.values(schema.properties).some((propSchema) => {
      const isObjectType = propSchema && (propSchema.type === 'object' || (Array.isArray(propSchema.type) && propSchema.type.includes('object')));
      return !isObjectType || !propSchema.properties;
    });
  }

  /** Normalize a schema node (resolve $ref, choose primary type when type is array). */
  normalizeSchema(node) { return this.services.schema.normalizeSchema(this.schema, node); }

  /** Get the base JSON structure. */
  _getBaseJSON(schemaNode) {
    return this.model.generateBaseJSON(schemaNode);
  }

  /**
   * Highlight a form group and update navigation
   */
  /** Highlight a group in the content and mirror selection in the sidebar. */
  highlightFormGroup(groupId) {
    // Remove existing highlights
    this.container.querySelectorAll('.form-ui-group, .form-ui-array-item[id]').forEach((group) => {
      group.classList.remove('highlighted');
    });

    // Remove existing overlay
    this.highlightOverlay.clear();

    // Clear all navigation active states more thoroughly
    if (this.navigationTree) {
      // Force remove active class from ALL navigation items
      this.navigationTree.querySelectorAll('.form-ui-nav-item').forEach((item) => {
        if (item.classList.contains('active')) {
          item.classList.remove('active');
        }
      });
    }

    // Add highlight to selected group
    const targetGroup = this.container.querySelector(`#${groupId}`);
    if (targetGroup) {
      targetGroup.classList.add('highlighted');

      // Create blue overlay positioned on the form body's border
      this.createBlueOverlay(targetGroup);
    }

    // Add active state to navigation item
    if (this.navigationTree) {
      const navItem = this.navigationTree.querySelector(`[data-group-id="${groupId}"]`);
      if (navItem) {
        navItem.classList.add('active');
        // Scroll the navigation item into view if it's not visible
        navItem.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });

      }
    }
  }

  /** Show a transient highlight overlay around `targetGroup`. */
  createBlueOverlay(targetGroup) {
    this.highlightOverlay.showFor(targetGroup);
  }

  /** Smooth-scroll the content body (or window) to the target group element. */
  scrollToFormGroup(groupId) {
    const targetGroup = this.container.querySelector(`#${groupId}`);
    if (!targetGroup) return;

    // Find best scroll container: prefer body, else nearest scrollable ancestor, else window
    const bodyEl = this.container.querySelector('.form-ui-body');
    const scrollPadding = (this._headerOffset || 0); // account for sticky header/breadcrumb

    const scrollEl = isElementScrollableY(bodyEl) ? bodyEl : findNearestScrollableAncestor(this.container);
    if (scrollEl) {
      // Compute offset of the group within the scrollable body
      const getOffsetTopWithinContainer = (element, containerEl) => {
        let top = 0;
        let node = element;
        while (node && node !== containerEl) {
          top += node.offsetTop;
          node = node.offsetParent;
        }
        return top;
      };
      const top = Math.max(0, getOffsetTopWithinContainer(targetGroup, scrollEl) - scrollPadding);
      scrollEl.scrollTo({ top, behavior: 'smooth' });
      return;
    }

    // Fallback to window scroll
    const rect = targetGroup.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top - scrollPadding;
    window.scrollTo({ top: absoluteTop, behavior: 'smooth' });
  }

  /** Cleanup features and internal references. */
  destroy() {
    try { this.navigation?.destroy?.(); } catch { /* noop */ }
    this.groupElements.clear();
    this.listeners.clear();
  }

  /**
   * Reorder an item inside an array-of-objects group and reindex inputs/ids.
   * Keeps data and DOM consistent, then navigates to the moved item.
   */
  reorderArrayItem(arrayPath, fromIndex, toIndex) {
    if (!this.container || typeof fromIndex !== 'number' || typeof toIndex !== 'number') return;
    if (fromIndex === toIndex) return;

    // Persist current edits first
    this.updateData();

    // Data-first: reorder JSON array
    this.model.reorderArray(this.data, arrayPath, fromIndex, toIndex);

    // Rebuild from data/schema so DOM and navigation reflect the new order consistently
    const movedItemId = this.arrayItemId(arrayPath, toIndex);
    this.rebuildBody();
    requestAnimationFrame(() => {
      const el = this.container?.querySelector?.(`#${movedItemId}`);
      if (el && el.id) this.navigation.navigateToGroup(el.id);
      this.validation.validateAllFields();
    });
  }
}
