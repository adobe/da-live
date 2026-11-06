import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { getTileTarget } from './utils.js';
import { loadTileEntries, readTileEntries } from './tile-content.js';
import './tile.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
const styles = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('./tile-layout.css', import.meta.url).href),
]);

export class DaLandingTiles extends LitElement {
  static properties = {
    entries: { attribute: false },
    contentBlock: { attribute: false },
    _contentError: { state: true },
    _scope: { state: true },
  };

  _sizing = sizing && new sizing.UISizeController(this);

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    this._unsubscribe = hashChange.subscribe((state) => this.setScope(state));
    if (this.entries === undefined) this._loadContent();
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    super.disconnectedCallback();
  }

  async _loadContent() {
    const result = this.contentBlock
      ? readTileEntries({ block: this.contentBlock })
      : await loadTileEntries();
    if (!this.isConnected || this.entries !== undefined) return;
    this._contentError = result.error;
    this.entries = result.entries;
  }

  setScope(state) {
    this._scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
  }

  renderTile(entry) {
    const { href, disabled } = getTileTarget({ entry, scope: this._scope });
    return html`<li><da-landing-tile .heading=${entry.heading} .description=${entry.description}
      .iconHref=${entry.iconHref} .tone=${entry.tone} .size=${this.dataset.uiSize || 's'}
      .actionId=${entry.id} .href=${href} .action=${!href}
      .disabled=${disabled}></da-landing-tile></li>`;
  }

  renderQuickLinks() {
    return html`<ul class="quick-links landing-tiles" aria-label="Quick links">
      ${this.entries.map((entry) => this.renderTile(entry))}
    </ul>`;
  }

  render() {
    return html`<div class="tile-group">
      ${this.entries ? this.renderQuickLinks() : nothing}
      ${this.entries === undefined && !this._contentError ? html`
        <p role="status">Loading quick links...</p>` : nothing}
      ${this._contentError ? html`<p role="alert">${this._contentError}</p>` : nothing}
    </div>`;
  }
}

customElements.define('da-landing-tiles', DaLandingTiles);

export default function init(el, { contentBlock } = {}) {
  const tiles = document.createElement('da-landing-tiles');
  tiles.contentBlock = contentBlock;
  el.append(tiles);
  return tiles;
}
