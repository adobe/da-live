import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, HashController } from '../../shared/nxutils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import './nx-panel-library.js';

const style = await loadStyle(import.meta.url);

class NxPanelExtension extends LitElement {
  static properties = {
    extension: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._hash = new HashController(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyChannel?.();
  }

  async _handlePluginLoad({ target }) {
    const hashState = this._hash.value || {};
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
      return html`<nx-panel-library .extension=${ext}></nx-panel-library>`;
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

customElements.define('nx-panel-extension', NxPanelExtension);
