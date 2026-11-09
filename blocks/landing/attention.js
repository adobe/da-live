import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { DA_ORIGIN } from '../shared/constants.js';
import { daFetch } from '../shared/utils.js';
import { formatTimestamp } from '../canvas/comments/helpers/format-utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const styles = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const ACTIONS = {
  'comment-mention': 'mentioned you on',
  'comment-reply': 'replied on',
};

export const actionLabel = ({ type, action }) => action || ACTIONS[type] || 'updated';

export function itemsForScope(notifications = [], scope = '') {
  if (!scope) return notifications;
  const [org, site] = scope.split('/');
  return notifications.filter((item) => item.org === org && item.site === site);
}

function request(opts = {}) {
  return daFetch(`${DA_ORIGIN}/notifications`, { ...opts, noRedirect: true }).catch(() => null);
}

export async function loadNotifications() {
  const resp = await request();
  if (!resp?.ok) return null;
  const json = await resp.json().catch(() => ({}));
  return json.notifications ?? [];
}

function update(change, ids) {
  return request({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ [change]: ids }),
  });
}

export default class DaLandingAttention extends LitElement {
  static properties = {
    scope: {},
    _items: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    this.load();
  }

  async load() {
    this._items = await loadNotifications();
  }

  _markRead(item) {
    if (item.read) return;
    const markRead = (entry) => (entry.id === item.id ? { ...entry, read: true } : entry);
    this._items = this._items.map(markRead);
    update('read', [item.id]);
  }

  _dismiss(item) {
    this._items = this._items.filter((entry) => entry.id !== item.id);
    update('done', [item.id]);
  }

  renderRow(item) {
    const actor = item.actor?.name ?? item.actor?.email;
    const page = item.title || item.path;
    return html`
      <li class=${item.read ? 'item' : 'item unread'}>
        <span class="unread-dot" aria-hidden="true"></span>
        <a class="item-link" href=${item.link} target="_blank" rel="noopener" title=${item.path}
          @click=${() => this._markRead(item)}>
          <span class="summary">
            ${item.read ? nothing : html`<span class="sr-only">Unread: </span>`}
            <strong>${actor}</strong> ${actionLabel(item)} <strong>${page}</strong>
          </span>
          ${item.description ? html`<span class="excerpt">${item.description}</span>` : nothing}
          <time datetime=${new Date(item.updatedAt).toISOString()}>${formatTimestamp(item.updatedAt)}</time>
        </a>
        <div class="item-actions">
          ${(item.actions ?? []).map((action) => html`
            <a class="nx-btn-primary nx-btn-sm" href=${action.link} target="_blank" rel="noopener"
              aria-label="${action.label} ${page}" @click=${() => this._markRead(item)}>${action.label}</a>`)}
          <button class="nx-action-btn-icon nx-btn-sm" type="button" title="Dismiss" aria-label="Dismiss ${page}"
            @click=${() => this._dismiss(item)}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-close-20-n.svg#icon"></use></svg>
          </button>
        </div>
      </li>`;
  }

  renderBody(items) {
    if (items === undefined) return html`<p class="empty">Loading…</p>`;
    if (items === null) return html`<p class="empty">Your inbox couldn't load. Try refreshing the page.</p>`;
    if (!items.length) return html`<p class="empty">You're all caught up.</p>`;
    return html`<ul class="items">${items.map((item) => this.renderRow(item))}</ul>`;
  }

  render() {
    const items = this._items && itemsForScope(this._items, this.scope);
    const unread = items?.filter((item) => !item.read).length;
    return html`
      <section aria-labelledby="attention-heading">
        <div class="heading">
          <h2 id="attention-heading">Inbox</h2>
          ${unread ? html`<span class="count">${unread} new</span>` : nothing}
        </div>
        ${this.renderBody(items)}
      </section>`;
  }
}

customElements.define('da-landing-attention', DaLandingAttention);
