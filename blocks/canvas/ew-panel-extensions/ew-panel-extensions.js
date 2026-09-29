import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import './ew-panel-library.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

const style = await loadStyle(import.meta.url);

function pageContextKey(source, { org, site, path } = {}) {
  if (!org || !site) return null;
  return JSON.stringify([org, site, path || '', source || '']);
}

class EwPanelExtension extends LitElement {
  static properties = {
    extension: { attribute: false },
    _hashState: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubHash = hashChange.subscribe((state) => {
      const source = this.extension?.sources?.[0];
      const previousKey = pageContextKey(source, this._hashState);
      const nextKey = pageContextKey(source, state);
      if (previousKey && previousKey !== nextKey && !this.extension?.ootb) {
        this._resetChannel();
        const iframe = this.shadowRoot.querySelector('.ext-iframe');
        if (iframe) iframe.style.display = 'none';
      }
      this._hashState = state;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this._resetChannel();
  }

  _resetChannel() {
    this._channelGeneration = (this._channelGeneration || 0) + 1;
    this._destroyChannel?.();
    this._destroyChannel = undefined;
  }

  async _handlePluginLoad({ target }) {
    const generation = (this._channelGeneration || 0) + 1;
    this._channelGeneration = generation;
    this._destroyChannel?.();
    this._destroyChannel = undefined;
    const hashState = this._hashState || {};
    const { setupIframeChannel } = await import('./iframe-protocol.js');
    const { destroy } = await setupIframeChannel({
      iframe: target,
      hashState,
      getView: () => getExtensionsBridge().view,
      onClose: () => this.dispatchEvent(
        new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }),
      ),
    });
    if (generation !== this._channelGeneration
      || target !== this.shadowRoot.querySelector('.ext-iframe')) {
      destroy();
      return;
    }
    this._destroyChannel = destroy;
  }

  render() {
    const ext = this.extension;
    if (!ext) return nothing;

    if (ext.ootb) {
      return html`<ew-panel-library .extension=${ext}></ew-panel-library>`;
    }

    const contextKey = pageContextKey(ext.sources?.[0], this._hashState);
    if (!contextKey) return nothing;

    return repeat([contextKey], (key) => key, () => html`
      <iframe
        class="ext-iframe"
        src=${ext.sources?.[0]}
        title=${ext.title}
        allow="clipboard-write *"
        @load=${this._handlePluginLoad}
      ></iframe>
    `);
  }
}

customElements.define('ew-panel-extension', EwPanelExtension);
