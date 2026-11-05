import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import { isStructured } from '../utils/model.js';
import { NAVIGATION_ORIGINS } from './navigation.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

/** The stylesheet of the sidebar, adopted by its shadow root. */
const style = await loadStyle(import.meta.url);

/** The tag name the sidebar is registered as. */
const ELEMENT_NAME = 'nx-sidebar';

/**
 * The navigation tree of the form, which lists the groups of fields and selects one on
 * click.
 * @property {object} [state] The engine state, see `createEngine`.
 * @property {{ pointer: string, origin: (string|null), seq: number }} [nav] The current
 *   selection, its origin and a counter that changes on every selection.
 * @property {(pointer: string, origin: string) => void} [onSelect] Selects a field.
 */
class Sidebar extends LitElement {
  static properties = {
    state: { attribute: false },
    nav: { attribute: false },
    onSelect: { attribute: false },
  };

  /** Adopts the sidebar stylesheet once the shadow root exists. */
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  /**
   * Scrolls to a field the editor selected. Selections of the sidebar itself are already
   * in view.
   * @param {Map<string, unknown>} changedProperties The properties that changed, with their
   *   previous values.
   */
  updated(changedProperties) {
    if (!changedProperties.has('state') && !changedProperties.has('nav')) {
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
    if (nextOrigin !== NAVIGATION_ORIGINS.editor) {
      return;
    }

    this._scrollTo(nextPointer);
  }

  /**
   * Scrolls the item of a pointer into view, if it is rendered.
   * @param {string} pointer The JSON pointer of the item.
   */
  _scrollTo(pointer) {
    const escapedPointer = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(pointer)
      : pointer.replace(/"/g, '\\"');
    const element = this.shadowRoot?.querySelector(`[data-pointer="${escapedPointer}"]`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  /**
   * Selects the group of a pointer on behalf of the sidebar.
   * @param {string} pointer The JSON pointer of the group.
   */
  _select(pointer) {
    this.onSelect?.(pointer, NAVIGATION_ORIGINS.sidebar);
  }

  /**
   * Checks whether a node appears in the navigation tree. Only groups of fields do.
   * @param {object} [node] A node of the engine's model.
   * @returns {boolean} Whether the node is listed.
   */
  _canRender(node) {
    return isStructured(node);
  }

  /**
   * Renders a group and its nested groups as a list item of the navigation tree.
   * @param {object} node A node of the engine's model.
   * @param {object} [options] The render settings.
   * @param {boolean} [options.isArrayItem] Whether the node is an item of an array.
   * @param {number|null} [options.arrayIndex] The position of the item, starting at 1.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The list item, or nothing
   *   when the node is not a group.
   */
  _renderNode(node, { isArrayItem = false, arrayIndex = null } = {}) {
    if (!this._canRender(node)) {
      return nothing;
    }

    const label = isArrayItem && arrayIndex != null
      ? `#${arrayIndex} ${node.label ?? ''}`
      : (node.label ?? '');
    const isActive = this.nav?.pointer === node.pointer;
    const children = node.kind === 'array' ? (node.items ?? []) : (node.children ?? []);

    return html`
      <li>
        <button
          type="button"
          class=${`item ${isActive ? 'is-active' : ''}`}
          data-pointer=${node.pointer}
          aria-current=${isActive ? 'location' : undefined}
          @click=${() => this._select(node.pointer)}
        >${label}</button>
        ${children.length ? html`
          <ul>
            ${children.map((child, index) => this._renderNode(
      child,
      node.kind === 'array' ? { isArrayItem: true, arrayIndex: index + 1 } : {},
    ))}
          </ul>
        ` : nothing}
      </li>
    `;
  }

  /**
   * Renders the navigation section with the tree of the model's root.
   * @returns {import('da-lit').TemplateResult} The navigation section.
   */
  render() {
    const root = this.state?.model?.root;

    return html`
      <div class="nx-sidebar-section">
        <p class="nx-sidebar-title">Navigation</p>
        ${root ? html`
          <div class="nav-list">
            <ul>${this._renderNode(root)}</ul>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

if (!customElements.get(ELEMENT_NAME)) {
  customElements.define(ELEMENT_NAME, Sidebar);
}
