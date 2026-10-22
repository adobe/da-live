import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const EL_NAME = 'nx-sidebar';

class Sidebar extends LitElement {
  static properties = {
    state: { attribute: false },
    nav: { attribute: false },
    onSelect: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated(changed) {
    if (!changed.has('state') && !changed.has('nav')) return;

    const prevNav = changed.get('nav');
    const prevSeq = prevNav?.seq ?? -1;
    const nextPointer = this.nav?.pointer;
    const nextOrigin = this.nav?.origin;
    const nextSeq = this.nav?.seq ?? 0;

    if (!nextPointer || nextSeq === prevSeq) return;
    if (nextOrigin !== 'editor') return;
    this._scrollTo(nextPointer);
  }

  _scrollTo(pointer) {
    const safe = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(pointer)
      : pointer.replace(/"/g, '\\"');
    const el = this.shadowRoot?.querySelector(`[data-pointer="${safe}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  _select(pointer) {
    this.onSelect?.(pointer, 'sidebar');
  }

  _canRender(node) {
    return node?.kind === 'object' || node?.kind === 'array';
  }

  _renderNode(node, { isArrayItem = false, arrayIndex = null } = {}) {
    if (!this._canRender(node)) return nothing;

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

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Sidebar);
}
