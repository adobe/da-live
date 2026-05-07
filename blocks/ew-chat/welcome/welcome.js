import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
import { initIms as loadIms } from '../../shared/utils.js';

const styles = await loadStyle(import.meta.url);

class NxChatWelcome extends LitElement {
  static properties = {
    prompts: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    loadIms().then(({ first_name: firstName, displayName }) => {
      this._firstName = firstName ?? displayName?.split(' ')[0];
      this.requestUpdate();
    });
  }

  _showMore() {
    this.dispatchEvent(new CustomEvent('nx-show-prompts', { bubbles: true, composed: true }));
  }

  render() {
    const greeting = `Welcome${this._firstName ? `, ${this._firstName}` : ''}`;
    const prompts = this.prompts ?? [];

    return html`
      <div class="chat-welcome-message">
        <h3>${greeting}</h3>
        <p>What are we working on today?</p>
      </div>
      ${prompts.length ? html`
        <div class="prompt-cards">
          ${prompts.slice(0, 3).map((card) => html`
            <button class="prompt-card" @click=${() => this.onSend?.(card.prompt)}>
              <span class="prompt-card-description">${card.description}</span>
            </button>
          `)}
        </div>
        ${prompts.length > 3 ? html`
          <button class="prompt-more" @click=${this._showMore}>Show more</button>
        ` : nothing}
      ` : nothing}
    `;
  }
}

customElements.define('nx-chat-welcome', NxChatWelcome);
