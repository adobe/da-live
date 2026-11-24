import { LitElement, html } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { isValidHref } from '../../shared/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
const styles = await loadStyle(import.meta.url);

export function parseTileEntries(block) {
  return [...(block?.children || [])].flatMap((row) => {
    const [icon, content, metadata] = row.children;
    const options = [...(metadata?.childNodes || [])].map((node) => node.textContent).join(' ');
    const link = content?.querySelector('h3 a');
    const iconName = icon?.textContent.trim().match(/^:(s2-icon-[a-z0-9-]+):$/)?.[1]
      || icon?.querySelector('span.icon')?.className.match(/\bicon-(s2-icon-[a-z0-9-]+)\b/)?.[1];
    if (!link?.textContent.trim() || !isValidHref(link.getAttribute('href')) || !iconName) {
      // eslint-disable-next-line no-console
      console.warn('Skipped a Browse row without an icon or a valid H3 title link.', row);
      return [];
    }
    return [{
      id: options.match(/\bid:\s*([a-z0-9-]+)/i)?.[1]
        || link.closest('h3').id || iconName,
      heading: link.textContent.trim(),
      description: [...content.querySelectorAll('li, p:not(li p)')]
        .map((item) => item.textContent.trim()).join(' '),
      iconHref: `/img/icons/${iconName}.svg`,
      href: link.getAttribute('href'),
      tone: options.match(/\btone:\s*([a-z0-9-]+)/i)?.[1].toLowerCase(),
    }];
  });
}

export class DaBrowseTiles extends LitElement {
  static properties = { entries: { attribute: false } };

  _sizing = sizing && new sizing.UISizeController(this);

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _onTileClick({ currentTarget }, { id }) {
    window.hlx?.rum?.sampleRUM?.('click', { source: `landing-action-${id}`, target: currentTarget.href });
  }

  renderTile(entry) {
    return html`<li><a class="tile" href=${entry.href}
      @click=${(event) => this._onTileClick(event, entry)}>
      <span class="icon ${entry.tone || ''}" aria-hidden="true"
        style="--tile-icon: url('${entry.iconHref}')"></span>
      <div class="content">
        <h3>${entry.heading}</h3>
        <p>${entry.description}</p>
      </div>
    </a></li>`;
  }

  render() {
    return html`<div class="tile-group">
      ${this.entries?.length ? html`<ul class="quick-links browse-tiles" aria-label="Quick links">
        ${this.entries.map((entry) => this.renderTile(entry))}
      </ul>` : html`<p role="alert">No quick links are configured.</p>`}
    </div>`;
  }
}

customElements.define('da-browse-tiles', DaBrowseTiles);

export default function init(el) {
  if (el.initialized) return el.initialized;
  const tiles = document.createElement('da-browse-tiles');
  tiles.entries = parseTileEntries(el);
  el.replaceChildren(tiles);
  el.initialized = tiles;
  return tiles;
}
