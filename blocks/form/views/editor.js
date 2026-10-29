import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import '../fields/input.js';
import '../fields/textarea.js';
import '../fields/picker.js';
import '../fields/checkbox.js';
import '../fields/button.js';
import '../fields/number.js';
import '../fields/date.js';
import '../fields/asset.js';
import { icon } from '../icons.js';
import { ASSET_TYPES, findAssetType, isAssetType } from '../assets/asset-types.js';
import { isStructured } from '../utils/model.js';
import { NAVIGATION_ORIGINS } from './navigation.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

/** The stylesheet of the editor, adopted by its shadow root. */
const style = await loadStyle(import.meta.url);

/** The tag name the editor is registered as. */
const ELEMENT_NAME = 'nx-editor';

/** How long typing pauses before a text or number input is saved. */
const DEBOUNCE_DELAY_MILLISECONDS = 350;

/** The asset type names as an English list, as named in the schema issues dialog. */
const ASSET_TYPE_LIST = new Intl.ListFormat('en', { type: 'conjunction' })
  .format(ASSET_TYPES.map(({ name }) => name));

/** Explains which `$ref` targets the form supports. */
const SUPPORTED_REFERENCES = `only same-document refs and the ${ASSET_TYPE_LIST} definitions are supported`;

/** Explains which keywords may sit next to an asset `$ref`. */
const ALLOWED_ASSET_KEYWORDS = 'only title, description, readOnly, default and, on an image, '
  + 'required: ["altText"] are allowed';

/**
 * Asset types are edited as one field, an object with `src` and, for images, `altText`.
 * @param {object} [node] A node of the engine's model.
 * @returns {boolean} Whether the node is edited as one asset field.
 */
function isAsset(node) {
  return isAssetType(node?.typeName);
}

/**
 * Builds the document value of an asset field. Removing the file clears the whole asset,
 * alt text included.
 * @param {{ value?: string, altText?: string }} field The asset field.
 * @returns {{ src: string, altText?: string }|undefined} The asset, or undefined when the
 *   field holds no file.
 */
function assetValue(field) {
  if (!field.value) {
    return undefined;
  }
  if (!field.altText) {
    return { src: field.value };
  }
  return { src: field.value, altText: field.altText };
}

/**
 * Lists names for a message, each in quotes.
 * @param {string[]} names The names to list.
 * @returns {string} The names, quoted and separated by commas.
 */
function quoteList(names) {
  return names.map((name) => `"${name}"`).join(', ');
}

/**
 * Describes why a part of the schema is not supported, as shown in the schema issues
 * dialog.
 * @param {{ reason: string, details?: object }} issue A schema issue of the engine.
 * @returns {string} The description, which follows the location of the issue.
 */
function describeIssue(issue) {
  const feature = issue.details?.keyword ?? issue.details?.type ?? 'unknown';
  const reference = issue.details?.ref;
  switch (issue.reason) {
    case 'unsupported-composition':
      return `uses unsupported composition keyword "${feature}"`;
    case 'unsupported-type':
      return `declares unsupported type "${feature}"`;
    case 'type-as-array':
      return 'declares "type" as an array';
    case 'missing-type':
      return 'is missing a "type" declaration';
    case 'external-ref':
      return `uses external $ref "${reference}" (${SUPPORTED_REFERENCES})`;
    case 'type-ref-keywords':
      return `sets ${quoteList(issue.details?.properties ?? [])} next to the asset $ref (${ALLOWED_ASSET_KEYWORDS})`;
    case 'unresolved-ref':
      return `uses $ref "${reference}" which does not resolve in the document`;
    default:
      return `uses unsupported schema feature "${feature}"`;
  }
}

/**
 * The form editor, which renders a field for every node of the engine's model and writes
 * the author's input back through the engine.
 * @property {object} [editor] The engine, see `createEngine`.
 * @property {object} [state] The engine state, see `createEngine`.
 * @property {{ pointer: string, origin: (string|null), seq: number }} [nav] The current
 *   selection, its origin and a counter that changes on every selection.
 * @property {(pointer: string, origin: string) => void} [onSelect] Selects a field.
 * @property {object[]} [assetSources] The sources asset fields select from, see
 *   `createAssetSources`.
 * @property {string} [previewOrigin] The origin that serves previews of site media.
 */
class Editor extends LitElement {
  static properties = {
    editor: { attribute: false },
    state: { attribute: false },
    nav: { attribute: false },
    onSelect: { attribute: false },

    assetSources: { attribute: false },
    previewOrigin: { attribute: false },

    _reorderPointer: { state: true },
    _reorderTargetIndex: { state: true },
    _reorderConfirmed: { state: true },

    _issuesOpen: { state: true },
    _openMenuPointer: { state: true },
  };

  /**
   * Sets up the initial state and the document listeners that close an open item menu.
   */
  constructor() {
    super();
    /** The pointer of the array item that is being moved, or an empty string. */
    this._reorderPointer = '';
    /** The position the moved item would take. */
    this._reorderTargetIndex = 0;
    /** Whether the move was confirmed and waits for the engine's new state. */
    this._reorderConfirmed = false;
    /** Whether the schema issues dialog is open. */
    this._issuesOpen = false;
    /** The pointer of the array item whose menu is open, or an empty string. */
    this._openMenuPointer = '';
    /** The pending debounced saves, by field pointer. */
    this._inputTimers = new Map();
    /** The schema issues the dialog last opened for. */
    this._lastIssues = null;
    /**
     * Closes the open item menu on a click outside of it.
     * @param {MouseEvent} event The document's `click` event.
     */
    this._onDocumentClick = (event) => {
      const openMenuElement = this.shadowRoot?.querySelector('.form-array-item.menu-open nx-array-menu');
      if (openMenuElement && event.composedPath().includes(openMenuElement)) {
        return;
      }

      this._closeMenu();
    };
    /**
     * Closes the open item menu on Escape.
     * @param {KeyboardEvent} event The document's `keydown` event.
     */
    this._onDocumentKeydown = (event) => {
      if (event.key === 'Escape') {
        this._closeMenu();
      }
    };
  }

  /** Adopts the editor stylesheet once the shadow root exists. */
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  /**
   * Lazily registers the array and dialog sub-elements after the first render. Browsers
   * upgrade existing tags (`nx-array-menu`, `nx-reorder`) once the modules call
   * `customElements.define`.
   */
  firstUpdated() {
    import('./array-menu.js');
    import('./reorder.js');
    import(`${getNx2()}/blocks/shared/dialog/dialog.js`);
  }

  /** Drops pending saves and the document listeners when the editor leaves the page. */
  disconnectedCallback() {
    this._inputTimers.forEach((id) => clearTimeout(id));
    this._inputTimers.clear();
    document.removeEventListener('click', this._onDocumentClick);
    document.removeEventListener('keydown', this._onDocumentKeydown);
    super.disconnectedCallback();
  }

  /**
   * Opens the schema issues dialog for new issues, ends a confirmed move and scrolls to a
   * field the sidebar selected.
   * @param {Map<string, unknown>} changedProperties The properties that changed, with their
   *   previous values.
   */
  updated(changedProperties) {
    if (!changedProperties.has('state') && !changedProperties.has('nav')) {
      return;
    }

    this._syncIssuesDialog();

    if (this._reorderConfirmed) {
      this._resetReorder();
      return;
    }

    const previousNavigation = changedProperties.get('nav');
    const previousSequence = previousNavigation?.seq ?? -1;
    const nextPointer = this.nav?.pointer;
    const nextOrigin = this.nav?.origin;
    const nextSequence = this.nav?.seq ?? 0;

    if (!nextPointer || nextSequence === previousSequence) {
      return;
    }
    if (nextOrigin !== NAVIGATION_ORIGINS.sidebar) {
      return;
    }

    this._scrollTo(nextPointer);
  }

  /**
   * Scrolls the field of a pointer into view, if it is rendered.
   * @param {string} pointer The JSON pointer of the field.
   */
  _scrollTo(pointer) {
    const escapedPointer = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(pointer)
      : pointer.replace(/"/g, '\\"');
    const element = this.shadowRoot?.querySelector(`[data-pointer="${escapedPointer}"]`);
    element?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  /**
   * Selects a field on behalf of the editor.
   * @param {string} pointer The JSON pointer of the field.
   */
  _select(pointer) {
    this.onSelect?.(pointer, NAVIGATION_ORIGINS.editor);
  }

  /**
   * Selects a group when the author clicks or focuses inside it. Group containers (object
   * fieldsets, array sections, structured array items) claim the selection for their own
   * pointer and stop propagation. Native bubbling ensures the innermost container wins, so
   * clicking a leaf input inside nested groups activates the closest group.
   * @param {string} pointer The JSON pointer of the group.
   * @param {Event} event The group's `click` or `focusin` event.
   */
  _onGroupActivate(pointer, event) {
    event.stopPropagation();
    this._select(pointer);
  }

  /**
   * Applies a mutation to the engine. The state notification flows through the engine's
   * `onChange` callback wired in the shell, so the view only invokes the mutation.
   * @param {(editor: object) => void} mutation Changes the document through the engine.
   */
  _mutate(mutation) {
    mutation(this.editor);
  }

  /**
   * Applies a mutation once typing in a field pauses, replacing the field's pending one.
   * @param {string} pointer The JSON pointer of the field.
   * @param {(editor: object) => void} mutation Changes the document through the engine.
   */
  _mutateDebounced(pointer, mutation) {
    clearTimeout(this._inputTimers.get(pointer));
    this._inputTimers.set(pointer, setTimeout(() => {
      this._inputTimers.delete(pointer);
      this._mutate(mutation);
    }, DEBOUNCE_DELAY_MILLISECONDS));
  }

  /**
   * Reads the validation error of a field.
   * @param {string} pointer The JSON pointer of the field.
   * @returns {string} The error message, or an empty string when the field is valid.
   */
  _error(pointer) {
    return this.state?.validation?.errors?.[pointer]?.message ?? '';
  }

  /**
   * Marks the selected field.
   * @param {string} [pointer] The JSON pointer of the field.
   * @returns {string} The active class with its leading space, or an empty string.
   */
  _activeClass(pointer) {
    return pointer && this.nav?.pointer === pointer ? ' is-active' : '';
  }

  /**
   * Reads the value a primitive field shows.
   * @param {object} [node] The field's node.
   * @returns {unknown} The node's value, false for an empty checkbox, or an empty string.
   */
  _primitiveValue(node) {
    if (!node) {
      return '';
    }
    if (node.value !== undefined) {
      return node.value;
    }
    if (node.kind === 'boolean') {
      return false;
    }
    // Defaults are materialized into the document at load by the SDK. The renderer is a
    // pure function of `node.value`, so a missing value means the field is empty, never
    // that a default should be synthesized here.
    return '';
  }

  /**
   * Saves a text field once typing pauses. An empty input clears the value.
   * @param {object} node The field's node.
   * @param {InputEvent} event The field's `input` event.
   */
  _onTextInput(node, event) {
    const inputValue = event.target.value;
    this._mutateDebounced(node.pointer, (editor) => {
      editor.setField(node.pointer, inputValue === '' ? undefined : inputValue);
    });
  }

  /**
   * Saves a number field once typing pauses. An empty or invalid input clears the value.
   * @param {object} node The field's node.
   * @param {InputEvent} event The field's `input` event.
   */
  _onNumberInput(node, event) {
    const inputValue = event.target.value;
    const value = inputValue === '' ? undefined : Number(inputValue);
    this._mutateDebounced(node.pointer, (editor) => {
      editor.setField(node.pointer, Number.isNaN(value) ? undefined : value);
    });
  }

  /**
   * Saves a checkbox at once.
   * @param {object} node The field's node.
   * @param {Event} event The checkbox's `change` event.
   */
  _onBooleanInput(node, event) {
    this._mutate((editor) => editor.setField(node.pointer, !!event.target.checked));
  }

  /**
   * Saves a picker at once. The empty option clears the value.
   * @param {object} node The field's node.
   * @param {Event} event The picker's `change` event.
   */
  _onSelectInput(node, event) {
    const inputValue = event.target.value;
    this._mutate((editor) => editor.setField(
      node.pointer,
      inputValue === '' ? undefined : inputValue,
    ));
  }

  /**
   * Saves the asset at once when the author selects, removes or describes it.
   * @param {object} node The asset node.
   * @param {Event} event The field's `change` event.
   */
  _onAssetChange(node, event) {
    const field = event.target;
    this._mutate((editor) => editor.setField(node.pointer, assetValue(field)));
  }

  /**
   * Renders an asset field with its alt text, when the schema has one.
   * @param {object} node The asset node.
   * @param {object} [options] The render settings.
   * @param {boolean} [options.hideLabel] Whether the label, description and required mark
   *   are left out, as for array items.
   * @returns {import('da-lit').TemplateResult} The asset field.
   */
  _renderAsset(node, { hideLabel = false } = {}) {
    const { pointer } = node;
    const { src, altText } = node.value ?? {};
    // A filled asset without a file reports the error on its `src`.
    const error = this._error(pointer) || this._error(`${pointer}/src`);
    const altNode = node.children?.find((child) => child.pointer === `${pointer}/altText`);
    return html`
      <form-asset
        data-pointer=${pointer}
        .label=${hideLabel ? '' : (node.label ?? '')}
        .required=${!hideLabel && !!node.required}
        .error=${error}
        .description=${hideLabel ? '' : (node.description ?? '')}
        .value=${src}
        .altText=${altText}
        .assetType=${node.typeName}
        .showsPreview=${findAssetType(node.typeName).showsPreview}
        .acceptsAltText=${!!altNode}
        .altRequired=${!!altNode?.required}
        .altError=${this._error(`${pointer}/altText`)}
        .sources=${this.assetSources}
        .previewOrigin=${this.previewOrigin}
        ?disabled=${!!node.readonly}
        @change=${(event) => this._onAssetChange(node, event)}
      ></form-asset>
    `;
  }

  /**
   * Renders the field of a primitive node: a picker for enums, a checkbox, a number, date
   * or long-text field, or a text input.
   * @param {object} node The field's node.
   * @param {object} [options] The render settings.
   * @param {boolean} [options.hideLabel] Whether the label, description and required mark
   *   are left out, as for array items.
   * @returns {import('da-lit').TemplateResult} The field.
   */
  _renderPrimitive(node, { hideLabel = false } = {}) {
    const required = !!node?.required;
    const readonly = !!node?.readonly;
    const pointer = node?.pointer ?? '';
    const error = this._error(pointer);
    const value = this._primitiveValue(node);
    const label = hideLabel ? '' : (node?.label ?? '');
    // Hide help text on array-item rows (same reason the label is hidden there).
    const description = hideLabel ? '' : (node?.description ?? '');
    const showRequired = !hideLabel && required;

    if (Array.isArray(node.enumValues)) {
      const currentValue = value === '' || value === undefined || value === null ? '' : value;
      return html`
        <form-picker
          data-pointer=${pointer}
          .label=${label}
          .required=${showRequired}
          .error=${error}
          .description=${description}
          .value=${currentValue}
          ?disabled=${readonly}
          @change=${(event) => this._onSelectInput(node, event)}
        >
          ${required
        ? html`<option value="" disabled ?selected=${currentValue === ''}>Please Select</option>`
        : html`<option value="" ?selected=${currentValue === ''}>None</option>`}
          ${node.enumValues.map((item) => html`
            <option value=${item} ?selected=${item === currentValue}>${item}</option>
          `)}
        </form-picker>
      `;
    }

    if (node.kind === 'boolean') {
      // form-checkbox uses its default slot as the label.
      return html`
        <form-checkbox
          data-pointer=${pointer}
          .error=${error}
          .description=${description}
          ?checked=${!!value}
          ?disabled=${readonly}
          @change=${(event) => this._onBooleanInput(node, event)}
        >${label}${showRequired ? html`<span class="is-required">*</span>` : nothing}</form-checkbox>
      `;
    }

    if (node.kind === 'number' || node.kind === 'integer') {
      const { minimum, maximum } = node.validation ?? {};
      return html`
        <form-number-field
          data-pointer=${pointer}
          .label=${label}
          .required=${showRequired}
          .error=${error}
          .description=${description}
          .value=${String(value ?? '')}
          .min=${minimum}
          .max=${maximum}
          .step=${node.kind === 'integer' ? 1 : undefined}
          ?disabled=${readonly}
          @input=${(event) => this._onNumberInput(node, event)}
        ></form-number-field>
      `;
    }

    if (node.format === 'date' || node.format === 'time' || node.format === 'date-time') {
      const widgetType = node.format === 'date-time' ? 'datetime' : node.format;
      return html`
        <form-date
          data-pointer=${pointer}
          .type=${widgetType}
          .label=${label}
          .required=${showRequired}
          .error=${error}
          .description=${description}
          .value=${value ?? ''}
          ?disabled=${readonly}
          @input=${(event) => this._onTextInput(node, event)}
        ></form-date>
      `;
    }

    if (node.semanticType === 'long-text') {
      return html`
        <form-textarea
          data-pointer=${pointer}
          .label=${label}
          .required=${showRequired}
          .error=${error}
          .description=${description}
          .value=${value ?? ''}
          ?disabled=${readonly}
          @input=${(event) => this._onTextInput(node, event)}
        ></form-textarea>
      `;
    }

    return html`
      <form-input
        data-pointer=${pointer}
        type="text"
        .label=${label}
        .required=${showRequired}
        .error=${error}
        .description=${description}
        .value=${value ?? ''}
        ?disabled=${readonly}
        @input=${(event) => this._onTextInput(node, event)}
      ></form-input>
    `;
  }

  /**
   * Names the button that adds an array item.
   * @param {object} [node] The array node.
   * @returns {string} The button label, with the item label when the schema has one.
   */
  _addLabel(node) {
    const itemLabel = node?.itemLabel ?? '';
    return itemLabel ? `Add ${itemLabel}` : 'Add item';
  }

  /** Ends the current move, confirmed or not. */
  _resetReorder() {
    this._reorderPointer = '';
    this._reorderTargetIndex = 0;
    this._reorderConfirmed = false;
  }

  /**
   * Sets the position the moved item would take, kept within the array.
   * @param {number} index The requested position.
   * @param {number} itemCount The number of items in the array.
   */
  _setReorderTarget(index, itemCount) {
    const lastIndex = Math.max(itemCount - 1, 0);
    this._reorderTargetIndex = Math.max(0, Math.min(index, lastIndex));
  }

  /**
   * Opens or closes the menu of an array item and selects the item, or the array for a
   * primitive item. Opening a menu cancels a move.
   * @param {CustomEvent<{ pointer: string }>} event The menu's `array-menu-toggle` event.
   * @param {object} node The array node.
   */
  _onArrayMenuToggle(event, node) {
    event.stopPropagation();
    const pointer = event?.detail?.pointer ?? '';
    if (!pointer) {
      return;
    }
    if (this._openMenuPointer === pointer) {
      this._closeMenu();
      return;
    }

    const item = node?.items?.find((candidate) => candidate.pointer === pointer);
    const structured = isStructured(item);
    this._openMenu(pointer);
    this._select(structured ? pointer : (node?.pointer ?? pointer));
    if (this._reorderPointer) {
      this._resetReorder();
    }
  }

  /**
   * Opens the menu of an array item and listens for the click or key that closes it. The
   * click listener is added after the current click, so the click that opened the menu
   * does not close it again.
   * @param {string} pointer The JSON pointer of the item.
   */
  _openMenu(pointer) {
    this._openMenuPointer = pointer;
    document.addEventListener('keydown', this._onDocumentKeydown);
    setTimeout(() => {
      if (this._openMenuPointer) {
        document.addEventListener('click', this._onDocumentClick);
      }
    }, 0);
  }

  /** Closes the open item menu and stops listening for the events that close it. */
  _closeMenu() {
    if (!this._openMenuPointer) {
      return;
    }

    this._openMenuPointer = '';
    document.removeEventListener('click', this._onDocumentClick);
    document.removeEventListener('keydown', this._onDocumentKeydown);
  }

  /**
   * Starts moving an array item from its current position.
   * @param {CustomEvent<{ pointer: string, index: number }>} event The menu's
   *   `array-reorder-start` event.
   * @param {number} itemCount The number of items in the array.
   */
  _onReorderStart(event, itemCount) {
    event.stopPropagation();
    this._closeMenu();
    const pointer = event?.detail?.pointer ?? '';
    if (!pointer) {
      return;
    }

    this._reorderPointer = pointer;
    this._setReorderTarget(event?.detail?.index ?? 0, itemCount);
  }

  /**
   * Inserts an empty item before an array item.
   * @param {CustomEvent<{ pointer: string }>} event The menu's `array-insert` event.
   */
  _onArrayInsert(event) {
    event.stopPropagation();
    this._closeMenu();
    const pointer = event?.detail?.pointer ?? '';
    if (!pointer) {
      return;
    }

    this._mutate((editor) => editor.insertItem(pointer));
  }

  /**
   * Removes an array item.
   * @param {CustomEvent<{ pointer: string }>} event The menu's `array-remove` event.
   */
  _onArrayRemove(event) {
    event.stopPropagation();
    this._closeMenu();
    const pointer = event?.detail?.pointer ?? '';
    if (!pointer) {
      return;
    }

    this._mutate((editor) => editor.removeItem(pointer));
  }

  /**
   * Orders array items as they would be after the current move, so the author previews
   * the new position before confirming it.
   * @param {object[]} items The array items in document order.
   * @returns {object[]} The items in preview order, or the items as they are without a
   *   move.
   */
  _itemsInPreviewOrder(items) {
    if (!this._reorderPointer) {
      return items;
    }

    const currentIndex = items.findIndex((item) => item.pointer === this._reorderPointer);
    if (currentIndex < 0) {
      return items;
    }

    const lastIndex = Math.max(items.length - 1, 0);
    const targetIndex = Math.max(0, Math.min(this._reorderTargetIndex, lastIndex));
    if (targetIndex === currentIndex) {
      return items;
    }

    const reordered = items.slice();
    const [item] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, item);
    return reordered;
  }

  /**
   * Moves the item to its previewed position in the document. A move that ends where it
   * started, or whose item is gone, is dropped.
   * @param {string} arrayPointer The JSON pointer of the array.
   * @param {object[]} items The array items in document order.
   */
  _confirmReorder(arrayPointer, items) {
    if (!this._reorderPointer) {
      return;
    }

    const fromIndex = items.findIndex((item) => item.pointer === this._reorderPointer);
    if (fromIndex < 0) {
      this._resetReorder();
      return;
    }

    const toIndex = this._reorderTargetIndex;
    if (toIndex === fromIndex) {
      this._resetReorder();
      return;
    }

    this._reorderConfirmed = true;
    this._mutate((editor) => editor.moveItem(arrayPointer, fromIndex, toIndex));
  }

  /**
   * Renders an object as a fieldset of its fields.
   * @param {object} node The object node.
   * @param {object} [options] The render settings.
   * @param {string} [options.itemLabel] The position label of an array item, such as `#2`.
   * @returns {import('da-lit').TemplateResult} The fieldset.
   */
  _renderObject(node, { itemLabel = '' } = {}) {
    const children = node.children ?? [];
    const error = this._error(node.pointer);
    const showDescription = !error && node.description;
    /** Selects the object when the author clicks or focuses inside it. */
    const activate = (event) => this._onGroupActivate(node.pointer, event);
    return html`
      <fieldset
        class="form-node${this._activeClass(node.pointer)}${error ? ' has-error' : ''}"
        data-pointer=${node.pointer}
        @click=${activate}
        @focusin=${activate}
      >
        <legend class="form-node-title">
          ${itemLabel ? html`<span class="form-item-label">${itemLabel}</span>` : nothing}
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </legend>
        ${error ? html`<p class="form-node-error">${error}</p>` : nothing}
        ${showDescription ? html`<p class="form-node-description">${node.description}</p>` : nothing}
        ${children.map((child) => this._renderNode(child))}
      </fieldset>
    `;
  }

  /**
   * Renders the content of an array item that is a group of fields.
   * @param {object} item The array item.
   * @param {number} index The position of the item.
   * @returns {import('da-lit').TemplateResult|import('da-lit').TemplateResult[]} The fields
   *   of an object item, or the item's own group.
   */
  _renderStructuredItem(item, index) {
    if (item.kind === 'object') {
      return (item.children ?? []).map((child) => this._renderNode(child));
    }
    return this._renderNode(item, { itemLabel: `#${index + 1}` });
  }

  /**
   * Renders an array as a section of its items, each with its menu, the move controls of
   * the moved item and the button that adds an item.
   * @param {object} node The array node.
   * @returns {import('da-lit').TemplateResult} The array section.
   */
  _renderArray(node) {
    const {
      items = [],
      readonly: nodeReadonly,
      minItems: nodeMinItems,
      maxItems,
    } = node ?? {};
    const itemCount = items.length;
    const displayItems = this._itemsInPreviewOrder(items);
    const displayPointers = displayItems.map((item) => item.pointer);
    const readonly = !!nodeReadonly;
    const minItems = nodeMinItems ?? 0;
    const canAdd = !readonly && (maxItems === undefined || itemCount < maxItems);
    const addLabel = this._addLabel(node);
    const error = this._error(node.pointer);
    const showDescription = !error && node.description;

    /** Selects the array when the author clicks or focuses inside it. */
    const activate = (event) => this._onGroupActivate(node.pointer, event);
    return html`
      <section
        class="form-node${this._activeClass(node.pointer)}${error ? ' has-error' : ''}"
        data-pointer=${node.pointer}
        @click=${activate}
        @focusin=${activate}
        @array-menu-toggle=${(event) => this._onArrayMenuToggle(event, node)}
        @array-reorder-start=${(event) => this._onReorderStart(event, itemCount)}
        @array-insert=${(event) => this._onArrayInsert(event)}
        @array-remove=${(event) => this._onArrayRemove(event)}
      >
        <div class="form-node-header">
          <p class="form-node-title">
            ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
          </p>
        </div>
        ${error ? html`<p class="form-node-error">${error}</p>` : nothing}
        ${showDescription ? html`<p class="form-node-description">${node.description}</p>` : nothing}

        ${displayItems.map((item, index) => {
      const structured = isStructured(item);
      const reorderActive = this._reorderPointer === item.pointer && !this._reorderConfirmed;
      const title = `#${index + 1} ${item.label ?? node.itemLabel ?? 'Item'}`;
      const menu = html`
      <nx-array-menu
        .pointer=${item.pointer}
        .index=${index}
        .pointers=${displayPointers}
        .readonly=${readonly}
        .itemCount=${itemCount}
        .minItems=${minItems}
        .maxItems=${maxItems}
        .required=${!!node.required}
        .active=${reorderActive}
        .open=${this._openMenuPointer === item.pointer}
        @focusin=${(event) => event.stopPropagation()}
      ></nx-array-menu>
    `;

      /**
       * Selects a structured item when the author clicks or focuses inside it. Primitive
       * items deliberately do nothing, so the event bubbles up to the surrounding array
       * section and selects the array.
       * @param {Event} event The item's `click` or `focusin` event.
       */
      const itemActivate = (event) => {
        if (!structured) {
          return;
        }

        this._onGroupActivate(item.pointer, event);
      };
      return html`
            <article
              class="form-array-item${this._activeClass(item.pointer)}${structured ? '' : ' form-array-item-primitive'}${reorderActive ? ' move-item-picked' : ''}${this._openMenuPointer === item.pointer ? ' menu-open' : ''}"
              data-pointer=${item.pointer}
              @click=${itemActivate}
              @focusin=${itemActivate}
            >
              ${structured ? html`
                <div class="form-array-item-header">
                  <p class="form-array-item-title">${title}</p>
                  <div class="form-array-item-actions">${menu}</div>
                </div>
                ${this._renderStructuredItem(item, index)}
              ` : html`
                <p class="form-array-item-simple-label">${title}</p>
                <div class="form-array-item-input-row">
                  ${isAsset(item)
          ? this._renderAsset(item, { hideLabel: true })
          : this._renderPrimitive(item, { hideLabel: true })}
                  <div class="form-array-item-actions">${menu}</div>
                </div>
              `}
              ${reorderActive ? html`
                <nx-reorder
                  .targetIndex=${this._reorderTargetIndex}
                  .totalItems=${itemCount}
                  @reorder-move-up=${() => this._setReorderTarget(this._reorderTargetIndex - 1, itemCount)}
                  @reorder-move-down=${() => this._setReorderTarget(this._reorderTargetIndex + 1, itemCount)}
                  @reorder-move-to-first=${() => this._setReorderTarget(0, itemCount)}
                  @reorder-move-to-last=${() => this._setReorderTarget(itemCount - 1, itemCount)}
                  @reorder-confirm=${() => this._confirmReorder(node.pointer, items)}
                  @reorder-cancel=${() => this._resetReorder()}
                ></nx-reorder>
              ` : nothing}
            </article>
          `;
    })}
        <div class="form-array-footer">
          <form-button
            variant="secondary"
            class="add-item-btn"
            ?disabled=${!canAdd}
            @click=${() => {
              if (canAdd) {
                this._mutate((editor) => editor.addItem(node.pointer));
              }
            }}
          >${icon('add')}<span>${addLabel}</span></form-button>
        </div>
      </section>
    `;
  }

  /**
   * Renders a node as the field or group its kind calls for. Unsupported subtrees are
   * skipped, and the schema issues dialog explains what was dropped. The document value
   * is preserved untouched.
   * @param {object} [node] A node of the engine's model.
   * @param {object} [options] The render settings of an object, see `_renderObject`.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The field or group, or
   *   nothing for a missing or unsupported node.
   */
  _renderNode(node, options = {}) {
    if (!node) {
      return nothing;
    }
    if (node.kind === 'unsupported') {
      return nothing;
    }
    if (isAsset(node)) {
      return this._renderAsset(node);
    }
    if (node.kind === 'object') {
      return this._renderObject(node, options);
    }
    if (node.kind === 'array') {
      return this._renderArray(node);
    }
    return this._renderPrimitive(node);
  }

  /**
   * Opens the schema issues dialog when the engine reports a new set of issues. The
   * issues are a closure-stable reference in `createEngine` that only changes inside
   * load, so reference equality is enough to detect a new set.
   */
  _syncIssuesDialog() {
    const issues = this.state?.schemaIssues;
    if (issues === this._lastIssues) {
      return;
    }

    this._lastIssues = issues;
    this._issuesOpen = !!(issues && issues.length);
  }

  /**
   * Renders the dialog that lists the parts of the schema the form does not support.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The dialog, or nothing when
   *   it is closed or there are no issues.
   */
  _renderIssuesDialog() {
    const issues = this.state?.schemaIssues ?? [];
    if (!this._issuesOpen || issues.length === 0) {
      return nothing;
    }

    return html`
      <nx-dialog title="Schema issues" @close=${() => { this._issuesOpen = false; }}>
        <p>The schema uses features the form does not support. Affected fields are not rendered. Their existing values remain in the saved document but cannot be edited here.</p>
        <ul class="schema-issues-list">
          ${issues.map((issue) => html`
            <li>
              <code>${issue.pointer}</code> — ${describeIssue(issue)}
            </li>
          `)}
        </ul>
        <form-button slot="actions" variant="secondary" @click=${() => { this._issuesOpen = false; }}>Dismiss</form-button>
      </nx-dialog>
    `;
  }

  /**
   * Renders the schema issues dialog and the fields of the model's root.
   * @returns {import('da-lit').TemplateResult} The editor content, or a hint when the
   *   model has no fields.
   */
  render() {
    const root = this.state?.model?.root;
    return html`
      ${this._renderIssuesDialog()}
      ${root
        ? html`<div class="editor-root">${this._renderNode(root)}</div>`
        : html`<p class="hint">No editable fields found.</p>`}
    `;
  }
}

if (!customElements.get(ELEMENT_NAME)) {
  customElements.define(ELEMENT_NAME, Editor);
}
