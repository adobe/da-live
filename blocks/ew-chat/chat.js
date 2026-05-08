import { LitElement, html, nothing } from 'da-lit';
import ChatController from './chat-controller.js';
import { renderMessage, renderApprovalCard } from './renderers.js';
import './welcome/welcome.js';
import './prompts/prompts.js';
import './pills/pills.js';
import { getNx } from '../../scripts/utils.js';
import { loadPrompts } from './api.js';
import { ADD_MENU_ITEMS, MENU_OPTIONS, ROLE, TOOL_STATE } from './constants.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

await import(`${getNx()}/blocks/shared/menu/menu.js`);

const styles = await loadStyle(import.meta.url);

const ICON_SRCS = {
  add: '/img/icons/s2-icon-add-20-n.svg',
  clear: '/img/icons/s2-icon-removecircle-20-n.svg',
  close: '/img/icons/s2-icon-splitleft-20-n.svg',
  send: '/img/icons/s2-icon-arrowupsend-20-n.svg',
  stop: '/img/icons/s2-icon-stop-20-n.svg',
  up: '/img/icons/s2-icon-chevronup-20-n.svg',
};

const icon = (name) => html`<img src="${ICON_SRCS[name]}" aria-hidden="true">`;

const UI_PROMPTS_GAP = 8;

class EwChat extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    connected: { type: Boolean },
    toolCards: { type: Object },
    _prompts: { state: true },
    _attachedItems: { state: true },
  };

  set context(value) {
    this._explicitContext = true;
    this._applyContext(value);
  }

  _onAddToChat = ({ detail }) => this.addAttachment(detail);

  addAttachment(item) {
    const current = this._attachedItems ?? [];
    if (current.some((i) => i.id === item.id)) return;
    this._attachedItems = [...current, item];
  }

  _applyContext(value) {
    this._context = value;
    this._controller?.setContext(value);
    this._loadPrompts();
    this.requestUpdate();
  }

  clear() {
    this._controller?.clear();
  }

  _closePanel() {
    this.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
  }

  async _loadPrompts() {
    const { org, site } = this._context ?? {};
    if (!org || !site) return;
    const key = `${org}/${site}`;
    if (this._promptsKey === key) return;
    this._promptsKey = key;
    const data = await loadPrompts(org, site);
    if (data) this._prompts = data.filter((p) => p.title && p.prompt);
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    this._controller = new ChatController({
      onToolDone: () => {
        this.dispatchEvent(new CustomEvent('nx-agent-change', { bubbles: true, composed: true }));
      },
      onUpdate: ({ messages, thinking, streamingText, connected, toolCards }) => {
        this.messages = streamingText
          ? [...(messages ?? []), { role: ROLE.ASSISTANT, content: streamingText, streaming: true }]
          : messages;
        this.thinking = thinking;
        this.connected = connected;
        this.toolCards = toolCards;
      },
    });
    if (this._context) this._controller.setContext(this._context);

    this._unsubscribeHash = hashChange.subscribe((state) => {
      if (!this._explicitContext) this._applyContext(state);
    });

    this._controller.connect().then(() => this._controller.loadInitialMessages());
    document.addEventListener('nx-add-to-chat', this._onAddToChat);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHash?.();
    this._controller?.destroy();
    document.removeEventListener('keydown', this._onApprovalKeydown);
    document.removeEventListener('nx-add-to-chat', this._onAddToChat);
  }

  _pendingApproval() {
    if (!this.toolCards) return null;
    for (const [toolCallId, card] of this.toolCards) {
      if (card.state === TOOL_STATE.APPROVAL_REQUESTED) return { toolCallId, ...card };
    }
    return null;
  }

  _onApprovalKeydown = (e) => {
    const pending = this._pendingApproval();
    if (!pending) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this._controller.approveToolCall(pending.toolCallId, false);
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      this._controller.approveToolCall(pending.toolCallId, true, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this._controller.approveToolCall(pending.toolCallId, true);
    }
  };

  updated(changed) {
    if (changed.has('messages')) {
      const log = this.shadowRoot.querySelector('.chat-scroll-container');
      if (log) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    }
    if (changed.has('thinking') && !this.thinking && changed.get('thinking')) {
      this.shadowRoot.querySelector('.chat-input')?.focus();
    }
    if (changed.has('toolCards')) {
      if (this._pendingApproval()) {
        document.addEventListener('keydown', this._onApprovalKeydown);
      } else {
        document.removeEventListener('keydown', this._onApprovalKeydown);
      }
    }
  }

  _openPrompts() {
    const popover = this.shadowRoot.querySelector('.prompts-popover');
    const form = this.shadowRoot.querySelector('.chat-form');
    if (!popover || !form) return;
    const { left, width, top } = form.getBoundingClientRect();
    popover.style.left = `${left}px`;
    popover.style.width = `${width}px`;
    popover.style.bottom = `${window.innerHeight - top + UI_PROMPTS_GAP}px`;
    popover.style.height = `${Math.min(top - UI_PROMPTS_GAP, 400)}px`;
    popover.addEventListener('toggle', ({ newState }) => {
      if (newState === 'open') this.shadowRoot.querySelector('nx-prompts')?.focus();
    }, { once: true });
    popover.show();
  }

  _onAddClick(e) {
    const popover = this.shadowRoot.querySelector('.prompts-popover');
    if (!popover?.open) return;
    e.stopImmediatePropagation();
    popover.close();
  }

  _handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _submit(e) {
    e?.preventDefault();
    if (this.thinking) {
      this._controller.stop();
      return;
    }
    const input = this.shadowRoot.querySelector('.chat-input');
    const message = input.value.trim();
    if (!message && !this._attachedItems?.length) return;
    const context = this._attachedItems ?? [];
    this._controller.sendMessage(message, context);
    input.value = '';
    this._attachedItems = [];
  }

  _sendPrompt(prompt) {
    if (!prompt || this.thinking || !this.connected) return;
    this.shadowRoot.querySelector('.prompts-popover')?.close();
    this._controller.sendMessage(prompt);
  }

  _handleMenuSelect({ detail: { id } }) {
    if (id === MENU_OPTIONS.PROMPT) this._openPrompts();
  }

  _handlePillRemove({ detail: { id } }) {
    this._attachedItems = (this._attachedItems ?? []).filter((item) => item.id !== id);
  }

  render() {
    const { view } = this._context ?? {};
    const prompts = (this._prompts ?? [])
      .filter((p) => !p.area || p.area === 'all' || p.area === view);

    return html`
      <nx-popover class="prompts-popover">
        <nx-prompts
          .prompts=${prompts}
          .onSend=${(p) => this._sendPrompt(p)}
        ></nx-prompts>
      </nx-popover>
      <div class="chat-header">
        <button
          type="button"
          class="chat-header-btn clear-btn"
          aria-label="Clear chat"
          ?hidden=${!this.messages?.length}
          @click=${() => this.clear()}
        >${icon('clear')}<span>Clear</span></button>
        <button
          type="button"
          class="chat-header-btn"
          aria-label="Close chat panel"
          @click=${this._closePanel}
        >${icon('close')}</button>
      </div>
      <div class="chat-scroll-container">
        <div class="chat-messages-container" role="log" aria-live="polite">
          ${!this.messages?.length && !this.thinking
        ? html`<nx-chat-welcome
              .prompts=${prompts}
              .onSend=${(p) => this._sendPrompt(p)}
              @nx-show-prompts=${this._openPrompts}
            ></nx-chat-welcome>`
        : nothing}
        ${this.messages?.map((msg) => renderMessage(msg, null, this.toolCards))}
        ${this.thinking && !this.messages?.at(-1)?.streaming ? html`<div class="chat-thinking">Thinking...</div>` : nothing}
        </div>
      </div>
      <div class="chat-form-wrap">
        ${renderApprovalCard(this._pendingApproval(), this._controller.approveToolCall)}
        <form class="chat-form" autocomplete="off" @submit=${this._submit}>
        ${this._attachedItems?.length ? html`
          <nx-chat-pills
            .items=${this._attachedItems}
            @nx-pill-remove=${this._handlePillRemove}
          ></nx-chat-pills>` : nothing}
        <textarea
          name="chat-input"
          class="chat-input"
          placeholder="Ask anything, or type / for commands..."
          ?disabled=${this.thinking || !this.connected}
          @keydown=${this._handleKeydown}
        ></textarea>
        <div class="chat-actions ${this.thinking ? 'chat-thinking' : ''}">
          <nx-menu .items=${ADD_MENU_ITEMS} placement="above" @select=${this._handleMenuSelect}>
            <button slot="trigger" class="chat-add" type="button" aria-label="Add" @click=${this._onAddClick}>
              <span class="icon-add">${icon('add')}</span>
              <span class="icon-up">${icon('up')}</span>
            </button>
          </nx-menu>
          <button class="chat-stop action-btn" type="button" aria-label="Stop" @click=${this._submit}>${icon('stop')}</button>
          <button class="chat-send action-btn" type="submit" aria-label="Send">${icon('send')}</button>
        </div>
        </form>
      </div>
    `;
  }
}

customElements.define('ew-chat', EwChat);
