import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { alertDiamondOrange, chevronDown, chevronLeft, chevronRight, uiCross } from './icons.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const sheet = await loadStyle(import.meta.url);

// The preview draws a 4.8px outline around the element (3px orange + 1.8px white ring); the
// design puts the card 12px beyond it, with its top edge level with the outline's top.
const OUTLINE_EXTENT = 4.8;
const GAP = 12 + OUTLINE_EXTENT;
const MARGIN = 8;

const SAFE_HREF = /^(https?:\/\/|\/|\.\/|#)/i;

/** Context may be one object, an array of them, or plain strings. */
export function normalizeContext(context) {
  if (!context) return [];
  const list = Array.isArray(context) ? context : [context];
  return list.map((entry) => {
    if (typeof entry === 'string') return { description: entry };
    const { category, description, href } = entry ?? {};
    return { category, description, href: SAFE_HREF.test(href ?? '') ? href : undefined };
  }).filter((e) => e.category || e.description || e.href);
}

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * Places a card next to an element rect: right, else left, else below, else above, always
 * clamped inside `bounds`. All rects are `{ top, left, width, height }` in host viewport px.
 */
export function computePlacement({ anchor, card, bounds }) {
  const minLeft = bounds.left + MARGIN;
  const maxLeft = bounds.left + bounds.width - card.width - MARGIN;
  const minTop = bounds.top + MARGIN;
  const maxTop = bounds.top + bounds.height - card.height - MARGIN;
  const right = anchor.left + anchor.width + GAP;
  const leftSide = anchor.left - GAP - card.width;
  const below = anchor.top + anchor.height + GAP;
  const above = anchor.top - GAP - card.height;
  const alignedTop = anchor.top - OUTLINE_EXTENT;

  let left;
  let top;
  let side;
  if (right <= maxLeft) {
    side = 'right';
    left = right;
    top = alignedTop;
  } else if (leftSide >= minLeft) {
    side = 'left';
    left = leftSide;
    top = alignedTop;
  } else if (below <= maxTop) {
    side = 'below';
    left = anchor.left;
    top = below;
  } else if (above >= minTop) {
    side = 'above';
    left = anchor.left;
    top = above;
  } else {
    side = 'overlay';
    left = right;
    top = alignedTop;
  }
  return {
    side,
    left: clamp(left, minLeft, Math.max(minLeft, maxLeft)),
    top: clamp(top, minTop, Math.max(minTop, maxTop)),
  };
}

/**
 * Floating card that explains one evaluation failure (it never edits the page). Anchored next
 * to `anchorRect` (host viewport coords) or, with `placement="center"`, shown as a centered
 * dialog. Emits bubbling, composed events: finding-close, finding-step ({ detail: { delta } }).
 */
export class EwFindingCard extends LitElement {
  static properties = {
    finding: { attribute: false },
    elementLabel: { type: String },
    index: { type: Number },
    total: { type: Number },
    placement: { type: String, reflect: true },
    anchorRect: { attribute: false },
    bounds: { attribute: false },
    unresolved: { type: Boolean },
    pending: { type: Boolean, reflect: true },
    _contextOpen: { state: true },
  };

  constructor() {
    super();
    this.index = 0;
    this.total = 1;
    this.placement = 'center';
    this._contextOpen = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  willUpdate(changed) {
    if (changed.has('finding')) this._contextOpen = false;
  }

  updated() {
    this._position();
  }

  _position() {
    const el = this.shadowRoot.querySelector('.card');
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bounds = this.bounds ?? { top: 0, left: 0, width: vw, height: vh };
    this.style.setProperty('--finding-card-max-height', `${Math.max(120, bounds.height - 2 * MARGIN)}px`);
    if (this.placement !== 'anchored' || !this.anchorRect) {
      this.style.left = '';
      this.style.top = '';
      this.removeAttribute('data-side');
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const pos = computePlacement({ anchor: this.anchorRect, card: { width, height }, bounds });
    this.style.left = `${Math.round(pos.left)}px`;
    this.style.top = `${Math.round(pos.top)}px`;
    this.setAttribute('data-side', pos.side);
  }

  focusCard() {
    this.shadowRoot.querySelector('.card')?.focus({ preventScroll: true });
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  _onKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._emit('finding-close');
    }
  }

  _renderContext() {
    const items = normalizeContext(this.finding?.context);
    if (!items.length) return nothing;
    return html`
      <details class="context" ?open=${this._contextOpen}
               @toggle=${(e) => { this._contextOpen = e.target.open; }}>
        <summary><span>Context</span>${chevronDown()}</summary>
        <ul>
          ${items.map((item) => html`
            <li>
              ${item.category ? html`<strong>${item.category}</strong>` : nothing}
              ${item.href
    ? html`<a href=${item.href} target="_blank" rel="noopener noreferrer">${item.description || item.href}</a>`
    : html`<span>${item.description}</span>`}
            </li>`)}
        </ul>
      </details>`;
  }

  _renderPager() {
    const total = this.total ?? 1;
    if (total <= 1) return nothing;
    const at = (this.index ?? 0) + 1;
    return html`
      <nav class="pager" aria-label="Failures on this element">
        <button type="button" class="step prev" ?disabled=${at <= 1}
                @click=${() => this._emit('finding-step', { delta: -1 })}>
          ${chevronLeft()}<span>Previous failure</span>
        </button>
        <span class="sr-only" aria-live="polite">${at} of ${total} failures</span>
        <button type="button" class="step next" ?disabled=${at >= total}
                @click=${() => this._emit('finding-step', { delta: 1 })}>
          <span>Next failure</span>${chevronRight()}
        </button>
      </nav>`;
  }

  render() {
    const { finding } = this;
    if (!finding) return nothing;
    const center = this.placement === 'center';
    const total = this.total ?? 1;
    const summary = finding.issue || finding.description;
    return html`
      ${center ? html`<div class="backdrop" @click=${() => this._emit('finding-close')}></div>` : nothing}
      <section class="card" role="dialog" aria-labelledby="finding-title" tabindex="-1"
               @keydown=${this._onKeydown}>
        <header>
          <h2>${this.elementLabel || finding.title}</h2>
          <span class="badge">${total} ${total === 1 ? 'failure' : 'failures'}</span>
          <button type="button" class="close" aria-label="Close"
                  @click=${() => this._emit('finding-close')}>${uiCross()}</button>
        </header>
        <div class="body">
          ${this.unresolved ? html`<p class="note" role="note">Couldn't locate this on the page.</p>` : nothing}
          <div class="failure">
            <span class="failure-icon">${alertDiamondOrange()}</span>
            <h3 id="finding-title">${finding.title}</h3>
          </div>
          ${summary ? html`
            <section class="summary">
              <h4>Summary</h4>
              <p>${summary}</p>
            </section>` : nothing}
          ${this._renderContext()}
        </div>
        ${this._renderPager()}
      </section>`;
  }
}

if (!customElements.get('ew-finding-card')) customElements.define('ew-finding-card', EwFindingCard);
