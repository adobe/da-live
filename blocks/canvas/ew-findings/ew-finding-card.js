import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const sheet = await loadStyle(import.meta.url);
const buttons = await getSheet(`${getNx2()}/styles/buttons.css`);

const GAP = 12;
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

  let left;
  let top;
  let side;
  if (right <= maxLeft) {
    side = 'right';
    left = right;
    top = anchor.top;
  } else if (leftSide >= minLeft) {
    side = 'left';
    left = leftSide;
    top = anchor.top;
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
    top = anchor.top;
  }
  return {
    side,
    left: clamp(left, minLeft, Math.max(minLeft, maxLeft)),
    top: clamp(top, minTop, Math.max(minTop, maxTop)),
  };
}

/**
 * Floating card for one evaluation finding. Anchored next to `anchorRect` (host viewport
 * coords) or, with `placement="center"`, shown as a centered dialog. Emits bubbling,
 * composed events: finding-close, finding-apply, finding-add-to-chat, finding-step
 * ({ detail: { delta } }).
 */
export class EwFindingCard extends LitElement {
  static properties = {
    finding: { attribute: false },
    quote: { type: String },
    replacement: { type: String },
    highlightOnly: { type: Boolean },
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
    this.shadowRoot.adoptedStyleSheets = [buttons, sheet];
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

  _renderChange() {
    if (!this.replacement) return nothing;
    return html`
      <p class="change">
        ${this.quote ? html`<q>${this.quote}</q> <span aria-hidden="true">→</span><span class="sr-only">changes to</span> ` : nothing}<q>${this.replacement}</q>
      </p>`;
  }

  _renderContext() {
    const items = normalizeContext(this.finding?.context);
    if (!items.length) return nothing;
    return html`
      <details class="context" ?open=${this._contextOpen}
               @toggle=${(e) => { this._contextOpen = e.target.open; }}>
        <summary>Context</summary>
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
    const at = (this.index ?? 0) + 1;
    return html`
      <nav class="pager" aria-label="Failures on this element">
        <button type="button" class="step" aria-label="Previous failure"
                ?disabled=${at <= 1} @click=${() => this._emit('finding-step', { delta: -1 })}>‹</button>
        <span aria-live="polite">${at} of ${total} ${total === 1 ? 'failure' : 'failures'}</span>
        <button type="button" class="step" aria-label="Next failure"
                ?disabled=${at >= total} @click=${() => this._emit('finding-step', { delta: 1 })}>›</button>
      </nav>`;
  }

  render() {
    const { finding } = this;
    if (!finding) return nothing;
    const center = this.placement === 'center';
    return html`
      ${center ? html`<div class="backdrop" @click=${() => this._emit('finding-close')}></div>` : nothing}
      <section class="card" role="dialog" aria-labelledby="finding-title" tabindex="-1"
               @keydown=${this._onKeydown}>
        <header>
          <h2 id="finding-title">${finding.title}</h2>
          <button type="button" class="close" aria-label="Close"
                  @click=${() => this._emit('finding-close')}>✕</button>
        </header>
        <div class="body">
          ${this.unresolved ? html`<p class="note" role="note">Couldn't locate this on the page.</p>` : nothing}
          <section class="suggestion">
            <h3>Suggested change</h3>
            <div class="suggestion-box">
              ${finding.suggested ? html`<p>${finding.suggested}</p>` : nothing}
              ${this._renderChange()}
              <div class="actions">
                <button type="button" class="nx-action-btn nx-btn-sm add"
                        @click=${() => this._emit('finding-add-to-chat')}>Add to chat</button>
                ${this.highlightOnly ? nothing : html`
                  <button type="button" class="nx-btn-accent nx-btn-sm apply"
                          @click=${() => this._emit('finding-apply')}>Apply change</button>`}
              </div>
            </div>
          </section>
          ${finding.issue ? html`
            <section class="issue">
              <h3>Issue identified</h3>
              <p>${finding.issue}</p>
            </section>` : nothing}
          ${this._renderContext()}
        </div>
        ${this._renderPager()}
      </section>`;
  }
}

if (!customElements.get('ew-finding-card')) customElements.define('ew-finding-card', EwFindingCard);
