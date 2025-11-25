import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/editor/sl-textarea-extended/sl-textarea-extended.js';
import './components/editor/sl-input-extended/sl-input-extended.js';
import './components/editor/sl-select-extended/sl-select-extended.js';
import './components/editor/sl-checkbox/sl-checkbox.js';
import './components/editor/form-item-group/form-item-group.js';
import './components/editor/form-breadcrumb/form-breadcrumb.js';
import { EVENT_EDITOR_SCROLL_TO, EVENT_VISIBLE_GROUP } from '../utils/events.js';
import { ref } from '../../../deps/lit/dist/index.js';
import VisibleGroupController from '../controllers/visible-group-controller.js';
import ScrollTargetController from '../controllers/scroll-target-controller.js';
import ActiveStateController from '../controllers/active-state-controller.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

class FormEditor extends LitElement {
  static properties = {
    formModel: { state: true },
    _data: { state: true },
    _activePointer: { state: true },
    _visiblePointer: { state: true },
  };

  constructor() {
    super();

    // Controller 1: Track active pointer
    this._activeState = new ActiveStateController(this, { propertyName: '_activePointer' });

    // Controller 2: Handle scroll-to commands
    this._scrollTarget = new ScrollTargetController(this, {
      scrollEvent: EVENT_EDITOR_SCROLL_TO,
      getHeaderOffset: () => this._getHeaderOffsetPx(),
    });

    // Controller 3: Detect visible groups
    this._visibleGroups = new VisibleGroupController(this, {
      getGroupId: (el) => el?.getAttribute?.('pointer'),
      getMeasureTarget: (el) => el?.shadowRoot?.querySelector?.('.item-title') || el,
      topOffsetPx: 0,
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._groupEls = new Map();
    // Listen for visible group changes from controller
    const handleVisible = (e) => { this._visiblePointer = e.detail?.pointer; };
    this.addEventListener(EVENT_VISIBLE_GROUP, handleVisible);
  }

  disconnectedCallback() {
    if (this._headerResizeObserver) {
      this._headerResizeObserver.disconnect();
      this._headerResizeObserver = null;
    }
    super.disconnectedCallback();
  }

  firstUpdated() {
    // Ensure header height is measured after initial render and keep it in sync
    this.updateHeaderOffsetVar();
    const header = this.shadowRoot.querySelector('.form-header');
    if (header && typeof ResizeObserver !== 'undefined') {
      this._headerResizeObserver = new ResizeObserver(() => this.updateHeaderOffsetVar());
      this._headerResizeObserver.observe(header);
    }
  }

  _getHeaderOffsetPx() {
    const header = this.shadowRoot.querySelector('.form-header');
    const headerHeight = header?.getBoundingClientRect().height || 0;
    return headerHeight + 8;
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getData();
    }
    super.update(props);
  }

  getData() {
    this._data = this.formModel.annotated;
    // Preserve current active pointer across data refresh if still present
    if (this._activePointer == null) {
      this._activePointer = this._data?.pointer ?? '';
    } else if (!this.hasPointer(this._data, this._activePointer)) {
      this._activePointer = this._data?.pointer ?? '';
    }
  }

  updateHeaderOffsetVar() {
    const offset = this._getHeaderOffsetPx();
    this.style.setProperty('--editor-header-height', `${offset}px`);
    // Keep visibility controller aligned with sticky header height
    this._visibleGroups?.setTopOffsetPx(offset);
  }

  emitReplace(pointer, value) {
    this.dispatchEvent(new CustomEvent('form-model-intent', {
      detail: { op: 'replace', path: pointer, value },
      bubbles: true,
      composed: true,
    }));
  }

  renderCheckbox(item) {
    return html`
      <sl-checkbox
        class="form-input"
        name="${item.key}"
        label="${item.schema.title}"
        .checked=${item.data ?? false}
        data-pointer="${item.pointer}"
        @change=${(e) => this.emitReplace(item.pointer, e.target.checked)}
      ></sl-checkbox>
    `;
  }

  renderPrimitive(item) {
    const primitives = ['string', 'boolean', 'number'];
    const prim = primitives.find((type) => type === item.schema.properties.type);
    if (prim) {
      if (prim === 'boolean') return this.renderCheckbox(item);

      // long-text semantic type -> textarea
      if (item.schema.properties['x-semantic-type'] === 'long-text') {
        return html`
          <sl-textarea-extended
            class="form-input"
            label="${item.schema.title}"
            .value=${item.data ?? ''}
            data-pointer="${item.pointer}"
            @change=${(e) => this.emitReplace(item.pointer, e.target.value)} 
          ></sl-textarea-extended>
        `;
      }

      // enum -> select (covers string enums and array items with enum)
      const enumOptions = item.schema.properties.enum
        || item.schema.properties.items?.enum;
      if (Array.isArray(enumOptions) && enumOptions.length) {
        const currentValue = Array.isArray(item.data) ? (item.data[0] ?? '') : (item.data ?? '');
        return html`
          <sl-select-extended
            class="form-input"
            name="${item.key}"
            label="${item.schema.title}"
            .value=${currentValue}
            data-pointer="${item.pointer}"
            @change=${(e) => {
            const next = item.schema.properties.type === 'array' ? [e.target.value] : e.target.value;
            this.emitReplace(item.pointer, next);
          }}
          >
            ${enumOptions.map((opt) => html`<option value="${opt}">${opt}</option>`)}
          </sl-select-extended>
        `;
      }

      return html`
        <sl-input-extended
          class="form-input"
          type="text"
          label="${item.schema.title}"
          .value=${item.data ?? ''}
          data-pointer="${item.pointer}"
          @change=${(e) => this.emitReplace(item.pointer, e.target.value)}
        ></sl-input-extended>
      `;
    }

    return nothing;
  }

  renderList(parent) {
    if (parent.schema.properties.items?.type) return nothing;

    if (!Array.isArray(parent.data)) return this.renderPrimitive(parent);

    return html`
      <form-item-group
        class="item-group"
        data-key="${parent.pointer}"
        pointer="${parent.pointer}"
        label="${parent.schema.title}"
        ?active=${parent.pointer === this._activePointer}
        ${ref((el) => {
      if (el) {
        this._groupEls.set(parent.pointer, el);
        this._scrollTarget?.registerTarget(parent.pointer, el);
        this._visibleGroups?.registerGroup(el);
      } else {
        const existing = this._groupEls.get(parent.pointer);
        this._scrollTarget?.unregisterTarget(parent.pointer);
        this._visibleGroups?.unregisterGroup(existing);
        this._groupEls.delete(parent.pointer);
      }
    })}
        .items=${Array.isArray(parent.data) ? parent.data.map((item) => this.renderList(item)) : []}
      >
      </form-item-group>
    `;
  }

  render() {
    if (!this._data) return nothing;

    const breadcrumbPointer = (this._visiblePointer ?? this._activePointer ?? this._data.pointer);

    return html`
      <div class="form-header">
        <h2>${this._data.schema.title}</h2>
        <form-breadcrumb .root=${this._data} .pointer=${breadcrumbPointer}></form-breadcrumb>
      </div>
      <form>
        <div>
          ${this.renderList(this._data)}
        </div>
      </form>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
