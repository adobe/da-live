import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import './ew-panel-library.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

class EwPanelExtension extends LitElement {
  static properties = {
    extension: { attribute: false },
    _hashState: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this._destroyChannel?.();
  }

  async _handlePluginLoad({ target }) {
    const hashState = this._hashState || {};
    const { setupIframeChannel } = await import('./iframe-protocol.js');
    this._destroyChannel?.();
    const { destroy } = await setupIframeChannel({
      iframe: target,
      hashState,
      getView: () => getExtensionsBridge().view,
      onClose: () => this.dispatchEvent(
        new CustomEvent('nx-panel-close', { bubbles: true, composed: true }),
      ),
    });
    this._destroyChannel = destroy;
  }

  render() {
    const ext = this.extension;
    if (!ext) return nothing;

    if (ext.ootb) {
      return html`<ew-panel-library .extension=${ext}></ew-panel-library>`;
    }

    return html`<iframe
      class="ext-iframe"
      src=${ext.sources?.[0]}
      title=${ext.title}
      allow="clipboard-write *"
      @load=${this._handlePluginLoad}
    ></iframe>`;
  }
}

customElements.define('ew-panel-extension', EwPanelExtension);
