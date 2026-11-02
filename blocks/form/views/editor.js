import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import '../fields/input.js';
import '../fields/textarea.js';
import '../fields/picker.js';
import '../fields/checkbox.js';
import '../fields/button.js';
import '../fields/number.js';
import '../fields/date.js';
import { icon } from '../icons.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const EL_NAME = 'nx-editor';
const DEBOUNCE_MS = 350;

function describeIssue(issue) {
  const feature = issue.details?.keyword ?? issue.details?.type ?? 'unknown';
  const ref = issue.details?.ref;
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
      return `uses external $ref "${ref}" (only same-document refs are supported)`;
    case 'unresolved-ref':
      return `uses $ref "${ref}" which does not resolve in the document`;
    default:
      return `uses unsupported schema feature "${feature}"`;
  }
}

class Editor extends LitElement {
  static properties = {
    editor: { attribute: false },
    state: { attribute: false },
    nav: { attribute: false },
    onSelect: { attribute: false },
    _reorderPointer: { state: true },
    _reorderTargetIndex: { state: true },
    _reorderConfirmed: { state: true },
    _issuesOpen: { state: true },
    _openMenuPointer: { state: true },
  };

  constructor() {
    super();
    this._reorderPointer = '';
    this._reorderTargetIndex = 0;
    this._reorderConfirmed = false;
    this._issuesOpen = false;
    this._openMenuPointer = '';
    this._inputTimers = new Map();
    this._lastIssues = null;
    this._onDocClick = (e) => {
      const openEl = this.shadowRoot?.querySelector('.form-array-item.menu-open nx-array-menu');
      if (openEl && e.composedPath().includes(openEl)) return;
      this._closeMenu();
    };
    this._onDocKeydown = (e) => {
      if (e.key === 'Escape') this._closeMenu();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  firstUpdated() {
    // Lazily register array UI sub-elements. Browsers upgrade existing tags
    // (`nx-array-menu`, `nx-reorder`) once the modules call customElements.define.
    import('./array-menu.js');
    import('./reorder.js');
    import(`${getNx2()}/blocks/shared/dialog/dialog.js`);
  }

  disconnectedCallback() {
    this._inputTimers.forEach((id) => clearTimeout(id));
    this._inputTimers.clear();
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onDocKeydown);
    super.disconnectedCallback();
  }

  updated(changed) {
    if (!changed.has('state') && !changed.has('nav')) return;

    this._syncIssuesDialog();

    if (this._reorderConfirmed) {
      this._resetReorder();
      return;
    }

    const prevNav = changed.get('nav');
    const prevSeq = prevNav?.seq ?? -1;
    const nextPointer = this.nav?.pointer;
    const nextOrigin = this.nav?.origin;
    const nextSeq = this.nav?.seq ?? 0;

    if (!nextPointer || nextSeq === prevSeq) return;
    if (nextOrigin !== 'sidebar') return;
    this._scrollTo(nextPointer);
  }

  _scrollTo(pointer) {
    const safe = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(pointer)
      : pointer.replace(/"/g, '\\"');
    const el = this.shadowRoot?.querySelector(`[data-pointer="${safe}"]`);
    el?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  _select(pointer) {
    this.onSelect?.(pointer, 'editor');
  }

  // Group containers (object fieldsets, array sections, structured array
  // items) claim selection for their own pointer on click/focusin and stop
  // propagation. Native bubbling ensures the innermost container wins, so
  // clicking a leaf input inside nested groups activates the closest group.
  _onGroupActivate(pointer, e) {
    e.stopPropagation();
    this._select(pointer);
  }

  _mutate(fn) {
    // State notification flows through editor's `onChange` callback wired in
    // the shell. UI just invokes the mutation.
    fn(this.editor);
  }

  _mutateDebounced(pointer, fn) {
    clearTimeout(this._inputTimers.get(pointer));
    this._inputTimers.set(pointer, setTimeout(() => {
      this._inputTimers.delete(pointer);
      this._mutate(fn);
    }, DEBOUNCE_MS));
  }

  _error(pointer) {
    return this.state?.validation?.errors?.[pointer]?.message ?? '';
  }

  _activeClass(pointer) {
    return pointer && this.nav?.pointer === pointer ? ' is-active' : '';
  }

  _primitiveValue(node) {
    if (!node) return '';
    if (node.value !== undefined) return node.value;
    if (node.kind === 'boolean') return false;
    // Defaults are materialized into the document at load by the SDK. The
    // renderer is a pure function of `node.value` — a missing value means the
    // field is empty, never that a default should be synthesized here.
    return '';
  }

  _onTextInput(node, e) {
    const raw = e.target.value;
    this._mutateDebounced(node.pointer, (editor) => {
      editor.setField(node.pointer, raw === '' ? undefined : raw);
    });
  }

  _onNumberInput(node, e) {
    const raw = e.target.value;
    const value = raw === '' ? undefined : Number(raw);
    this._mutateDebounced(node.pointer, (editor) => {
      editor.setField(node.pointer, Number.isNaN(value) ? undefined : value);
    });
  }

  _onBooleanInput(node, e) {
    this._mutate((editor) => editor.setField(node.pointer, !!e.target.checked));
  }

  _onSelectInput(node, e) {
    const raw = e.target.value;
    this._mutate((editor) => editor.setField(node.pointer, raw === '' ? undefined : raw));
  }

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
          @change=${(e) => this._onSelectInput(node, e)}
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
          @change=${(e) => this._onBooleanInput(node, e)}
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
          @input=${(e) => this._onNumberInput(node, e)}
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
          @input=${(e) => this._onTextInput(node, e)}
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
          @input=${(e) => this._onTextInput(node, e)}
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
        @input=${(e) => this._onTextInput(node, e)}
      ></form-input>
    `;
  }

  _addLabel(node) {
    const itemLabel = node?.itemLabel ?? '';
    return itemLabel ? `Add ${itemLabel}` : 'Add item';
  }

  _resetReorder() {
    this._reorderPointer = '';
    this._reorderTargetIndex = 0;
    this._reorderConfirmed = false;
  }

  _setReorderTarget(index, itemCount) {
    const lastIndex = Math.max(itemCount - 1, 0);
    this._reorderTargetIndex = Math.max(0, Math.min(index, lastIndex));
  }

  _onArrayMenuToggle(e, node) {
    e.stopPropagation();
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;
    if (this._openMenuPointer === pointer) {
      this._closeMenu();
      return;
    }
    const item = node?.items?.find((i) => i.pointer === pointer);
    const structured = item?.kind === 'object' || item?.kind === 'array';
    this._openMenu(pointer);
    this._select(structured ? pointer : (node?.pointer ?? pointer));
    if (this._reorderPointer) this._resetReorder();
  }

  _openMenu(pointer) {
    this._openMenuPointer = pointer;
    document.addEventListener('keydown', this._onDocKeydown);
    setTimeout(() => {
      if (this._openMenuPointer) document.addEventListener('click', this._onDocClick);
    }, 0);
  }

  _closeMenu() {
    if (!this._openMenuPointer) return;
    this._openMenuPointer = '';
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onDocKeydown);
  }

  _onReorderStart(e, itemCount) {
    e.stopPropagation();
    this._closeMenu();
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;
    this._reorderPointer = pointer;
    this._setReorderTarget(e?.detail?.index ?? 0, itemCount);
  }

  _onArrayInsert(e) {
    e.stopPropagation();
    this._closeMenu();
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;
    this._mutate((editor) => editor.insertItem(pointer));
  }

  _onArrayRemove(e) {
    e.stopPropagation();
    this._closeMenu();
    const pointer = e?.detail?.pointer ?? '';
    if (!pointer) return;
    this._mutate((editor) => editor.removeItem(pointer));
  }

  _itemsInPreviewOrder(items) {
    if (!this._reorderPointer) return items;

    const currentIndex = items.findIndex((item) => item.pointer === this._reorderPointer);
    if (currentIndex < 0) return items;

    const lastIndex = Math.max(items.length - 1, 0);
    const targetIndex = Math.max(0, Math.min(this._reorderTargetIndex, lastIndex));
    if (targetIndex === currentIndex) return items;

    const reordered = items.slice();
    const [item] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, item);
    return reordered;
  }

  _confirmReorder(arrayPointer, items) {
    if (!this._reorderPointer) return;

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

  _renderObject(node, { itemLabel = '' } = {}) {
    const children = node.children ?? [];
    const error = this._error(node.pointer);
    const showDesc = !error && node.description;
    const activate = (e) => this._onGroupActivate(node.pointer, e);
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
        ${showDesc ? html`<p class="form-node-description">${node.description}</p>` : nothing}
        ${children.map((child) => this._renderNode(child))}
      </fieldset>
    `;
  }

  _renderArray(node) {
    const { items = [], readonly: nodeReadonly, minItems: nodeMin, maxItems } = node ?? {};
    const itemCount = items.length;
    const displayItems = this._itemsInPreviewOrder(items);
    const displayPointers = displayItems.map((item) => item.pointer);
    const readonly = !!nodeReadonly;
    const minItems = nodeMin ?? 0;
    const canAdd = !readonly && (maxItems === undefined || itemCount < maxItems);
    const addLabel = this._addLabel(node);
    const error = this._error(node.pointer);
    const showDesc = !error && node.description;

    const activate = (e) => this._onGroupActivate(node.pointer, e);
    return html`
      <section
        class="form-node${this._activeClass(node.pointer)}${error ? ' has-error' : ''}"
        data-pointer=${node.pointer}
        @click=${activate}
        @focusin=${activate}
        @array-menu-toggle=${(e) => this._onArrayMenuToggle(e, node)}
        @array-reorder-start=${(e) => this._onReorderStart(e, itemCount)}
        @array-insert=${(e) => this._onArrayInsert(e)}
        @array-remove=${(e) => this._onArrayRemove(e)}
      >
        <div class="form-node-header">
          <p class="form-node-title">
            ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
          </p>
        </div>
        ${error ? html`<p class="form-node-error">${error}</p>` : nothing}
        ${showDesc ? html`<p class="form-node-description">${node.description}</p>` : nothing}

        ${displayItems.map((item, index) => {
      const structured = item.kind === 'object' || item.kind === 'array';
      const reorderActive = this._reorderPointer === item.pointer && !this._reorderConfirmed;
      const title = `#${index + 1} ${item.label ?? node.itemLabel ?? 'Item'}`;
      const content = item.kind === 'object'
        ? (item.children ?? []).map((c) => this._renderNode(c))
        : this._renderNode(item, { itemLabel: `#${index + 1}` });
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
        @focusin=${(e) => e.stopPropagation()}
      ></nx-array-menu>
    `;

      // For primitive items we deliberately do nothing so the click bubbles
      // up to the surrounding array section and activates the array.
      const itemActivate = (e) => {
        if (!structured) return;
        this._onGroupActivate(item.pointer, e);
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
                ${content}
              ` : html`
                <p class="form-array-item-simple-label">${title}</p>
                <div class="form-array-item-input-row">
                  ${this._renderPrimitive(item, { hideLabel: true })}
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
            @click=${() => { if (canAdd) this._mutate((editor) => editor.addItem(node.pointer)); }}
          >${icon('add')}<span>${addLabel}</span></form-button>
        </div>
      </section>
    `;
  }

  _renderNode(node, options = {}) {
    if (!node) return nothing;
    // Unsupported subtrees are skipped — the schema-issues dialog explains
    // what was dropped. The document value is preserved untouched.
    if (node.kind === 'unsupported') return nothing;
    if (node.kind === 'object') return this._renderObject(node, options);
    if (node.kind === 'array') return this._renderArray(node);
    return this._renderPrimitive(node);
  }

  _syncIssuesDialog() {
    // schemaIssues is a closure-stable reference in createEngine (only changes
    // inside load), so reference equality is sufficient to detect a new set.
    const issues = this.state?.schemaIssues;
    if (issues === this._lastIssues) return;
    this._lastIssues = issues;
    this._issuesOpen = !!(issues && issues.length);
  }

  _renderIssuesDialog() {
    const issues = this.state?.schemaIssues ?? [];
    if (!this._issuesOpen || issues.length === 0) return nothing;
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

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Editor);
}
