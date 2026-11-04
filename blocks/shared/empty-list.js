import { html, nothing } from 'da-lit';
import { openProfileMenu, NOT_PERMITTED_HINT } from './utils.js';

export const NOT_PERMITTED = 'Not permitted';

// Callers load this into their document or shadow root (see empty-list.css).
export const EMPTY_LIST_CSS = new URL('./styles/empty-list.css', import.meta.url).href;

// Empty / "Not permitted" state shared by browse (v2 + legacy) and sheet/config.
// Returns a da-lit template: use it in a Lit render() or with da-lit's render().
// The Open Profile button uses nx2 buttons.css (nx-btn-primary), which callers load.
export function renderEmptyList(message) {
  const notPermitted = message === NOT_PERMITTED
    ? html`<p class="empty-list-hint">${NOT_PERMITTED_HINT}</p>
      <button type="button" class="empty-list-action nx-btn-primary" @click=${() => openProfileMenu()}>
        Open Profile
      </button>`
    : nothing;
  return html`<div class="empty-list"><h3>${message}</h3>${notPermitted}</div>`;
}
