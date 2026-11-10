import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../scripts/utils.js';
import { getChatPanelContent, chatAvailability } from '../shared/chat-panel.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT, registerPanelSection, wasPanelOpen } = await import(`${getNx()}/utils/panel.js`);
const { CHAT_EVENT, useAoChat } = await import(`${getNx()}/utils/chat.js`);
const [styles, welcomeStyles] = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('./welcome.css', import.meta.url).href),
]);

const toggleChatPanel = (open) => {
  const type = open ? PANEL_EVENT.OPEN : PANEL_EVENT.CLOSE;
  document.dispatchEvent(new CustomEvent(type, { detail: { section: 'chat' } }));
};

const openChatPanel = () => toggleChatPanel(true);
const MESSAGE_SENT_EVENT = CHAT_EVENT.MESSAGE_SENT || 'nx-chat-message-sent';
const CHAT_PLACEHOLDER = 'Ask a question, share an idea, or add a task.';

export class DaLanding extends LitElement {
  static properties = {
    _name: { state: true },
    _chatInput: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [welcomeStyles];
    this.addEventListener(MESSAGE_SENT_EVENT, openChatPanel);
    this._unsubChat = chatAvailability.subscribe((enabled) => this._onChatAvailability(enabled));
    this._loadName();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener(MESSAGE_SENT_EVENT, openChatPanel);
    this._unsubChat?.();
    this._chatRequest = undefined;
  }

  async _loadName() {
    try {
      const { loadIms } = await import(`${getNx()}/utils/ims.js`);
      const profile = await loadIms();
      const name = profile?.first_name?.trim() || profile?.displayName?.trim().split(/\s+/)[0];
      if (this.isConnected) this._name = name;
    } catch {
      // The greeting stays generic without a profile.
    }
  }

  async _onChatAvailability(enabled) {
    const request = {};
    this._chatRequest = request;
    this._chatInput = undefined;
    if (enabled === undefined) return;
    const setChatInput = (value) => {
      if (this._chatRequest === request) this._chatInput = value;
    };
    if (!enabled) {
      setChatInput(false);
      toggleChatPanel(false);
      return;
    }
    registerPanelSection('chat', {
      position: 'before',
      width: '400px',
      getContent: getChatPanelContent(),
    });
    if (wasPanelOpen('chat')) openChatPanel();
    try {
      // The compact input shares its session only with the AO chat.
      if (!await useAoChat()) {
        setChatInput(false);
        return;
      }
      await import(`${getNx()}/blocks/chat-ao/input.js`);
      setChatInput(true);
    } catch (error) {
      setChatInput(false);
      // eslint-disable-next-line no-console
      console.warn('Could not load the landing chat input.', error);
    }
  }

  _renderHeading() {
    if (this._chatInput === undefined) return nothing;
    const heading = this._chatInput
      ? `Hi${this._name ? ` ${this._name}` : ''}, how can I help?`
      : `Welcome${this._name ? `, ${this._name}` : ''}`;
    return html`<h1 id="welcome-heading">${heading}</h1>`;
  }

  render() {
    return html`
      <section class="welcome" aria-labelledby="welcome-heading">
        ${this._renderHeading()}
        ${this._chatInput ? html`<nx-ao-input placeholder=${CHAT_PLACEHOLDER}></nx-ao-input>` : nothing}
      </section>
    `;
  }
}

if (!customElements.get('da-landing')) customElements.define('da-landing', DaLanding);

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(styles)) document.adoptedStyleSheets.push(styles);
  const landing = el.querySelector(':scope > .landing') ?? document.createElement('da-landing');
  landing.className = 'landing';
  const theme = new URLSearchParams(window.location.search).get('theme');
  if (['light', 'dark'].includes(theme)) landing.dataset.theme = theme;
  else delete landing.dataset.theme;
  if (landing.parentElement !== el) el.replaceChildren(landing);
}
