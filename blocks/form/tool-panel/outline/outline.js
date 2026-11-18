import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../../scripts/utils.js';
import { NAV_ORIGIN, formEvents } from '../../events.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const EL_NAME = 'ew-form-outline';

const isGroup = (node) => node?.kind === 'object' || node?.kind === 'array';

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
 */
class FormOutline extends LitElement {
  static properties = {
    _root: { state: true },
    _nav: { state: true },
  };

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

  updated(changed) {
    // A selection made in the editor brings its row into view.
    if (changed.has('_nav') && this._nav?.origin === NAV_ORIGIN.EDITOR) {
      this.shadowRoot.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
    }
  }

  _jump(pointer) {
    formEvents.jumpRequest.emit({ pointer });
  }

  _renderGroup(node, index) {
    const groups = childGroups(node);
    const isCurrent = this._nav?.pointer === node.pointer;
    const label = index ? `#${index} ${node.label}` : node.label;

    return html`
      <li>
        <button
          type="button"
          class="item"
          aria-current=${isCurrent ? 'location' : nothing}
          data-pointer=${node.pointer}
          title=${label}
          @click=${() => this._jump(node.pointer)}
        >${label}</button>
        ${groups.length ? html`
          <ul>${groups.map(({ child, index: position }) => this._renderGroup(child, position))}</ul>
        ` : nothing}
      </li>
    `;
  }

  render() {
    if (!isGroup(this._root)) {
      return html`<p class="placeholder">The outline appears once a document is open.</p>`;
    }

    return html`<nav aria-label="Outline"><ul>${this._renderGroup(this._root, null)}</ul></nav>`;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, FormOutline);
}
