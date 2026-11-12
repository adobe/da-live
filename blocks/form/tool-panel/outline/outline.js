import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../../scripts/utils.js';
import { NAV_ORIGIN, formEvents } from '../../events.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const EL_NAME = 'ew-form-outline';

// The root and its sections start open, deeper groups start collapsed.
const OPEN_DEPTH = 2;

const CHEVRON = html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.25 3.5 10.75 8l-4.5 4.5"/></svg>`;

const isGroup = (node) => node?.kind === 'object' || node?.kind === 'array';

const contains = (node, pointer) => pointer?.startsWith(`${node.pointer}/`) ?? false;

// Array items carry their 1-based position, which the outline shows as "#n".
function childGroups(node) {
  const children = node.kind === 'array'
    ? (node.items ?? []).map((child, position) => ({ child, index: position + 1 }))
    : (node.children ?? []).map((child) => ({ child, index: null }));
  return children.filter(({ child }) => isGroup(child));
}

// The groups that contain a pointer, from the root down.
function ancestorsOf(root, pointer) {
  const ancestors = [];
  let node = root;
  while (node && contains(node, pointer)) {
    ancestors.push(node);
    node = childGroups(node).find(({ child }) => contains(child, pointer))?.child;
  }
  return ancestors;
}

/**
 * Lists the groups of the structured content document in the tool panel,
 * marks the current selection and asks the editor to reveal a group on click.
 * The document title stays above the list, and the section being scrolled
 * through stays pinned.
 * A selection made in the editor opens only the path to its row.
 */
class FormOutline extends LitElement {
  static properties = {
    _root: { state: true },
    _nav: { state: true },
    _toggled: { state: true },
    _revealed: { state: true },
  };

  constructor() {
    super();
    // Groups the user opened or closed, by pointer.
    this._toggled = new Map();
    // Groups opened to reveal the latest editor selection.
    this._revealed = new Set();
    // Room added below the list so a closed group keeps its place.
    this._slack = 0;
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
    if (changed.has('_nav') && this._nav?.origin === NAV_ORIGIN.EDITOR && isGroup(this._root)) {
      this._reveal(this._nav.pointer);
    }
  }

  updated(changed) {
    // The list's scroll padding keeps the row clear of the pinned section header.
    if (changed.has('_nav') && this._nav?.origin === NAV_ORIGIN.EDITOR) {
      this.shadowRoot.querySelector('.row.is-current')?.scrollIntoView({ block: 'nearest' });
    }
    if (this._anchor) {
      this._restoreAnchor();
    }
  }

  _rowOf(pointer) {
    return [...this.shadowRoot.querySelectorAll('.row .label')]
      .find((label) => label.dataset.pointer === pointer)?.closest('.row');
  }

  // Remembers where a row sits, so opening or closing it does not move it.
  _keepInPlace(pointer) {
    const row = this._rowOf(pointer);
    if (row) {
      this._anchor = { pointer, top: row.getBoundingClientRect().top };
    }
  }

  _restoreAnchor() {
    const { pointer, top } = this._anchor;
    this._anchor = null;
    const row = this._rowOf(pointer);
    const list = this.shadowRoot.querySelector('.sections');
    if (!row || !list) {
      return;
    }

    const target = list.scrollTop + row.getBoundingClientRect().top - top;
    // A shorter list would pull the row down near its end, so room is added below.
    const shortfall = target - (list.scrollHeight - list.clientHeight);
    if (shortfall > 0) {
      this._setSlack(list, this._slack + shortfall);
    }
    list.scrollTop = target;
  }

  _setSlack(list, slack) {
    this._slack = slack;
    list.style.setProperty('--slack', `${slack}px`);
  }

  // Drops the added room once it has scrolled out of view.
  _onListScroll(event) {
    const list = event.currentTarget;
    if (this._slack && list.scrollTop + list.clientHeight <= list.scrollHeight - this._slack) {
      this._setSlack(list, 0);
    }
  }

  _isOpenByChoice(node, depth) {
    return this._toggled.get(node.pointer) ?? depth < OPEN_DEPTH;
  }

  _isExpanded(node, depth) {
    return this._revealed.has(node.pointer) || this._isOpenByChoice(node, depth);
  }

  // Opens the path to a selection and closes what an earlier selection opened.
  _reveal(pointer) {
    const closed = ancestorsOf(this._root, pointer)
      .filter((node, depth) => !this._isOpenByChoice(node, depth));
    this._revealed = new Set(closed.map((node) => node.pointer));
  }

  _toggle(node, depth) {
    const toggled = new Map(this._toggled);
    toggled.set(node.pointer, !this._isExpanded(node, depth));
    const revealed = new Set(this._revealed);
    revealed.delete(node.pointer);
    this._toggled = toggled;
    this._revealed = revealed;
  }

  _jump(pointer) {
    formEvents.jumpRequest.emit({ pointer });
  }

  // A row jumps the editor to its group and, like a file explorer, toggles its nested groups.
  _select(node, depth, canExpand) {
    this._jump(node.pointer);
    if (canExpand) {
      this._keepInPlace(node.pointer);
      this._toggle(node, depth);
    }
  }

  _renderName(node, index) {
    return html`<span class="name">${index ? html`<span class="index">#${index}</span>` : nothing}${node.label}</span>`;
  }

  _renderGroup(node, depth, index) {
    const groups = childGroups(node);
    const canExpand = groups.length > 0;
    const current = this._nav?.pointer;
    const isCurrent = current === node.pointer;
    const isExpanded = canExpand && this._isExpanded(node, depth);
    const hidesCurrent = canExpand && !isExpanded && contains(node, current);
    const level = depth - 1;
    const classes = ['row', depth === 1 && 'section', isCurrent && 'is-current', hidesCurrent && 'hides-current']
      .filter(Boolean).join(' ');

    const row = html`
      <div class=${classes}>
        <button
          type="button"
          class="label"
          style="--level: ${level}"
          title=${index ? `#${index} ${node.label}` : node.label}
          aria-current=${isCurrent ? 'location' : nothing}
          aria-expanded=${canExpand ? String(isExpanded) : nothing}
          data-pointer=${node.pointer}
          @click=${() => this._select(node, depth, canExpand)}
        >
          <span class="lead">${canExpand ? CHEVRON : nothing}</span>
          ${this._renderName(node, index)}
        </button>
      </div>`;

    return html`
      <li>
        ${depth === 1 ? html`<div class="section-header"><div class="bar">${row}</div></div>` : row}
        ${isExpanded ? html`
          <ul class="children${isCurrent ? ' of-current' : ''}" style="--level: ${level}">
            ${groups.map(({ child, index: position }) => this._renderGroup(child, depth + 1, position))}
          </ul>
        ` : nothing}
      </li>
    `;
  }

  _renderTitle() {
    const isCurrent = this._nav?.pointer === this._root.pointer;
    return html`<div class="title${isCurrent ? ' is-current' : ''}">
      <button
        type="button"
        class="label"
        title=${this._root.label}
        aria-current=${isCurrent ? 'location' : nothing}
        data-pointer=${this._root.pointer}
        @click=${() => this._jump(this._root.pointer)}
      >${this._renderName(this._root, null)}</button>
    </div>`;
  }

  render() {
    if (!isGroup(this._root)) {
      return html`<p class="placeholder">The outline appears once a document is open.</p>`;
    }

    return html`<nav aria-label="Outline">
      ${this._renderTitle()}
      <ul class="sections" @scroll=${this._onListScroll}>${childGroups(this._root).map(({ child, index }) => this._renderGroup(child, 1, index))}</ul>
    </nav>`;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, FormOutline);
}
