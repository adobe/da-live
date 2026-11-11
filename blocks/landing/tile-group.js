import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { createPage, doesFileExist } from '../shared/da-file-item/item.js';
import { getTileTarget } from './utils.js';

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
    if (!link?.textContent.trim() || !link.getAttribute('href') || !iconName) {
      // eslint-disable-next-line no-console
      console.warn('Skipped a Landing row without an icon or an H3 title link.', row);
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

export class DaLandingTiles extends LitElement {
  static properties = {
    entries: { attribute: false },
    _scope: { state: true },
    _createDialog: { state: true },
  };

  _sizing = sizing && new sizing.UISizeController(this);

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  disconnectedCallback() {
    this._createDialog = undefined;
    super.disconnectedCallback();
  }

  setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (scope !== this._scope) this._createDialog = undefined;
    this._scope = scope;
  }

  async _onCreatePage() {
    if (this._createDialog) return;
    this._createDialog = { scope: this._scope };
    await import('../shared/da-name-dialog/da-name-dialog.js');
  }

  _onCloseCreatePage() {
    this._createDialog = undefined;
  }

  async _onCreatePageSubmit({ detail: { name } }) {
    if (!this._createDialog || this._createDialog.saving) return;
    const dialog = { ...this._createDialog, saving: true, error: undefined };
    this._createDialog = dialog;
    const isCurrent = () => this.isConnected && this._createDialog === dialog;
    const path = `/${dialog.scope}/${name}.html`;
    let error;
    try {
      if (await doesFileExist(path)) error = 'A page with this name already exists.';
      else if (isCurrent()) {
        const href = await createPage({ path, isCurrent });
        if (href && isCurrent()) this.navigate(href);
      }
    } catch {
      error = 'Could not create the page.';
    }
    if (error && isCurrent()) {
      this._createDialog = { ...dialog, saving: false, error };
    }
  }

  navigate(href) {
    window.location.href = href;
  }

  _onTileClick({ id, href, action }) {
    window.hlx?.rum?.sampleRUM?.('click', { source: `landing-action-${id}`, target: href || action });
    if (action === 'create-page') this._onCreatePage();
  }

  renderTile(entry) {
    const { href, action, disabled } = getTileTarget({ entry, scope: this._scope });
    const content = html`
      <span class="icon ${['green', 'orange', 'purple'].includes(entry.tone)
        ? entry.tone : 'turquoise'}" aria-hidden="true"
        style="--tile-icon: url('${entry.iconHref}')"></span>
      <div class="content">
        <h3>${entry.heading}</h3>
        <p>${entry.description}</p>
      </div>`;
    const onClick = disabled ? nothing : () => this._onTileClick({ id: entry.id, href, action });
    return html`<li>${href
      ? html`<a class="tile" href=${href} @click=${onClick}>${content}</a>`
      : html`<button class="tile" type="button" ?disabled=${disabled}
          @click=${onClick}>${content}</button>`}</li>`;
  }

  renderCreateDialog() {
    const { scope, saving, error } = this._createDialog;
    return html`<da-name-dialog open dialog-title="New page in ${scope.split('/')[1]}"
      name-placeholder="page name" ?saving=${saving} .error=${error || ''}
      @da-name-submit=${this._onCreatePageSubmit}
      @close=${this._onCloseCreatePage}></da-name-dialog>`;
  }

  render() {
    return html`<div class="tile-group">
      ${this.entries?.length ? html`<ul class="quick-links landing-tiles" aria-label="Quick links">
        ${this.entries.map((entry) => this.renderTile(entry))}
      </ul>` : html`<p role="alert">No quick links are configured.</p>`}
      ${this._createDialog ? this.renderCreateDialog() : nothing}
    </div>`;
  }
}

customElements.define('da-landing-tiles', DaLandingTiles);

export default function init(el, { contentBlock, scope } = {}) {
  const tiles = document.createElement('da-landing-tiles');
  tiles.entries = parseTileEntries(contentBlock);
  tiles.setScope(scope);
  el.append(tiles);
  return tiles;
}
