import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../../scripts/utils.js';
import { NAV_ORIGIN, formEvents } from '../../events.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const EL_NAME = 'ew-form-outline';

const isGroup = (node) => node?.kind === 'object' || node?.kind === 'array';

// The section a pointer belongs to, which is the group directly below the root.
const sectionOf = (pointer) => pointer.split('/').slice(0, 3).join('/');

// Array items carry their 1-based position, which the outline shows as "#n".
function childGroups(node) {
  const children = node.kind === 'array'
    ? (node.items ?? []).map((child, position) => ({ child, index: position + 1 }))
    : (node.children ?? []).map((child) => ({ child, index: null }));
  return children.filter(({ child }) => isGroup(child));
}

/**
 * Lists the groups of the structured content document in the tool panel,
 * marks the current selection and asks the editor to reveal a group on click.
 * Sections collapse, and a selection made in the editor opens its section.
 */
class FormOutline extends LitElement {
  static properties = {
    _root: { state: true },
    _nav: { state: true },
    _collapsed: { state: true },
  };

  constructor() {
    super();
    this._collapsed = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubscribers = [
      formEvents.formState.subscribe((state) => { this._root = state?.model?.root ?? null; }),
      formEvents.selectionState.subscribe((nav) => { this._nav = nav; }),
    ];
  }

  disconnectedCallback() {
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    super.disconnectedCallback();
  }

  willUpdate(changed) {
    const pointer = this._nav?.pointer;
    if (!changed.has('_nav') || this._nav?.origin !== NAV_ORIGIN.EDITOR || !pointer) {
      return;
    }

    const section = sectionOf(pointer);
    if (this._collapsed.has(section)) {
      this._toggle(section);
    }
  }

  updated(changed) {
    // A selection made in the editor brings its row into view.
    if (changed.has('_nav') && this._nav?.origin === NAV_ORIGIN.EDITOR) {
      this.shadowRoot.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
    }
  }

  _toggle(pointer) {
    const collapsed = new Set(this._collapsed);
    if (!collapsed.delete(pointer)) {
      collapsed.add(pointer);
    }
    this._collapsed = collapsed;
  }

  _jump(pointer) {
    formEvents.jumpRequest.emit({ pointer });
  }

  _renderGroup(node, depth, index) {
    const groups = childGroups(node);
    const isSection = depth <= 1;
    const isCurrent = this._nav?.pointer === node.pointer;
    const isExpanded = !this._collapsed.has(node.pointer);

    return html`
      <li style="--depth: ${depth}">
        <div class="row${isSection ? ' section' : ''}${isCurrent ? ' is-current' : ''}">
          <span class="lead">
            ${depth === 1 && groups.length ? this._renderToggle(node, isExpanded) : nothing}
            ${depth > 1 ? html`<span class="dot"></span>` : nothing}
          </span>
          <button
            type="button"
            class="label"
            aria-current=${isCurrent ? 'location' : nothing}
            data-pointer=${node.pointer}
            @click=${() => this._jump(node.pointer)}
          >${index ? html`<span class="index">#${index}</span>` : nothing}${node.label}</button>
        </div>
        ${groups.length && isExpanded ? html`
          <ul>${groups.map(({ child, index: position }) => this._renderGroup(child, depth + 1, position))}</ul>
        ` : nothing}
      </li>
    `;
  }

  _renderToggle(node, isExpanded) {
    return html`<button
      type="button"
      class="toggle"
      aria-expanded=${String(isExpanded)}
      aria-label="${isExpanded ? 'Collapse' : 'Expand'} ${node.label}"
      @click=${() => this._toggle(node.pointer)}
    ></button>`;
  }

  render() {
    if (!isGroup(this._root)) {
      return html`<p class="placeholder">The outline appears once a document is open.</p>`;
    }

    return html`<nav aria-label="Outline"><ul>${this._renderGroup(this._root, 0, null)}</ul></nav>`;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, FormOutline);
}
