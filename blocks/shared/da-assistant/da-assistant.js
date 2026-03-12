import { LitElement, html } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import { initIms } from '../../shared/utils.js';
import getPathDetails from '../../shared/pathDetails.js';
import ChatController from './da-assistant-controller.js';

const sheet = await getSheet('/blocks/shared/da-assistant/da-assistant.css');
const DEFAULT_PANEL_WIDTH = 420;
const ASSISTANT_OPEN_STATE_KEY = 'da-assistant:is-open';
const DOCUMENT_UPDATED_EVENT = 'da:agent-content-updated';

class DaAssistant extends LitElement {
  static properties = {
    isAssistantOpen: { type: Boolean, state: true },
    connected: { type: Boolean, state: true },
    messages: { type: Array, state: true },
    inputValue: { type: String, state: true },
    isThinking: { type: Boolean, state: true },
    statusText: { type: String, state: true },
  };

  constructor() {
    super();
    this.isAssistantOpen = this.getSavedOpenState();
    this.connected = false;
    this.messages = [];
    this.inputValue = '';
    this.isThinking = false;
    this.statusText = '';

    this.imsToken = null;
    this._previousDocPaddingRight = '';
    this.chatController = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    await this.loadImsToken();
  }

  disconnectedCallback() {
    this.chatController?.disconnect();
    this.clearLayoutOffset();
    super.disconnectedCallback();
  }

  updated(changedProperties) {
    if (changedProperties.has('isAssistantOpen')) {
      this.saveOpenState(this.isAssistantOpen);
      if (this.isAssistantOpen) {
        this.ensureController();
        this.chatController?.connect();
        this.applyLayoutOffset();
      } else {
        this.clearLayoutOffset();
      }
    }
  }

  ensureController() {
    if (this.chatController) return;

    this.chatController = new ChatController({
      host: 'localhost:5173',
      getContext: () => {
        const details = getPathDetails() || {};
        const fullPath = details.fullpath || '';
        const owner = details.owner || '';
        const repo = details.repo || '';

        let path = '';
        if (fullPath && owner && repo) {
          const prefix = `/${owner}/${repo}/`;
          if (fullPath.startsWith(prefix)) {
            path = fullPath.slice(prefix.length);
          } else {
            path = fullPath.replace(/^\/+/, '');
          }
        }

        return {
          org: owner,
          site: repo,
          path,
          view: details.view || '',
        };
      },
      getImsToken: () => this.imsToken,
      onUpdate: () => {
        this.messages = [...this.chatController.messages];
        this.isThinking = this.chatController.isThinking;
        this.scrollMessagesToBottom();
      },
      onStatusChange: (statusText) => {
        this.statusText = statusText || '';
      },
      onConnectionChange: (connected) => {
        this.connected = connected;
      },
      onDocumentUpdated: (payload) => {
        window.dispatchEvent(new CustomEvent(DOCUMENT_UPDATED_EVENT, {
          detail: {
            ...payload,
            ts: Date.now(),
          },
        }));
      },
    });
  }

  getSavedOpenState() {
    try {
      return localStorage.getItem(ASSISTANT_OPEN_STATE_KEY) === '1';
    } catch {
      return false;
    }
  }

  saveOpenState(isOpen) {
    try {
      localStorage.setItem(ASSISTANT_OPEN_STATE_KEY, isOpen ? '1' : '0');
    } catch {
      // Ignore local storage failures.
    }
  }

  async loadImsToken() {
    try {
      const imsDetails = await initIms();
      if (imsDetails?.accessToken?.token) {
        this.imsToken = imsDetails.accessToken.token;
      }
    } catch (e) {
      console.warn('[DA-Assistant] Could not load IMS token', e);
    }
  }

  applyLayoutOffset() {
    const docEl = document.documentElement;
    if (!docEl) return;

    this._previousDocPaddingRight = docEl.style.paddingRight;

    this.updateComplete.then(() => {
      const panel = this.shadowRoot?.querySelector('.panel');
      const panelWidth = Math.ceil(panel?.getBoundingClientRect().width || DEFAULT_PANEL_WIDTH);
      docEl.style.paddingRight = `${panelWidth}px`;
    });
  }

  clearLayoutOffset() {
    const docEl = document.documentElement;
    if (!docEl) return;
    docEl.style.paddingRight = this._previousDocPaddingRight || '';
  }

  scrollMessagesToBottom() {
    this.updateComplete.then(() => {
      const messagesEl = this.shadowRoot?.querySelector('.messages');
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  toggleAssistant() {
    this.isAssistantOpen = !this.isAssistantOpen;
  }

  handleInput(e) {
    this.inputValue = e.target.value;
  }

  handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage() {
    const content = this.inputValue.trim();
    if (!content || this.isThinking) return;
    if (!this.chatController) return;

    this.inputValue = '';
    this.chatController.sendMessage(content);
  }

  stopRequest() {
    this.chatController?.stop();
  }

  clearChat() {
    this.chatController?.clearHistory();
  }

  sendToolApproval(id, approved) {
    if (!id || !this.chatController) return;
    this.chatController.addToolApprovalResponse({ id, approved });
  }

  sendPrompt(prompt) {
    if (!prompt || this.isThinking || !this.connected) return;
    this.chatController?.sendMessage(prompt);
  }

  getToolName(part) {
    if (typeof part?.toolName === 'string' && part.toolName) return part.toolName;
    if (typeof part?.type === 'string' && part.type.startsWith('tool-')) {
      return part.type.replace('tool-', '');
    }
    return 'Tool';
  }

  isToolPart(part) {
    if (!part || typeof part !== 'object') return false;
    return !!(
      part.type === 'dynamic-tool'
      || part.type === 'tool'
      || (typeof part.type === 'string' && part.type.startsWith('tool-'))
      || part.toolCallId
      || part.approval
    );
  }

  renderToolPart(part) {
    if (!this.isToolPart(part)) return '';
    const toolName = this.getToolName(part);

    if (
      part.approval
      && (
        part.state === 'approval-requested'
        || typeof part.approval.approved === 'undefined'
      )
    ) {
      const approvalId = part.approval?.id;
      return html`
        <div class="message-row assistant">
          <div class="message-bubble approval-bubble">
            <div class="approval-title"><strong>Approval needed:</strong> ${toolName}</div>
            <div class="approval-actions">
              <button
                class="approval-btn approve"
                ?disabled=${!approvalId || this.isThinking}
                @click=${() => this.sendToolApproval(approvalId, true)}
              >
                <span class="approval-btn-label">Approve</span>
              </button>
              <button
                class="approval-btn reject"
                ?disabled=${!approvalId || this.isThinking}
                @click=${() => this.sendToolApproval(approvalId, false)}
              >
                <span class="approval-btn-label">Reject</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    if (part.state === 'output-denied' || part.approval?.approved === false) {
      return html`
        <div class="message-row assistant">
          <div class="message-bubble">
            <strong>${toolName}</strong>: Rejected
          </div>
        </div>
      `;
    }

    if (part.state === 'output-available') {
      return html`
        <div class="message-row assistant">
          <div class="message-bubble">
            <strong>${toolName}</strong>: Done
          </div>
        </div>
      `;
    }

    if (part.state === 'input-available' || part.state === 'input-streaming') {
      return html`
        <div class="message-row assistant">
          <div class="message-bubble">
            Running ${toolName}...
          </div>
        </div>
      `;
    }

    return '';
  }

  renderWelcome() {
    const prompts = [
      'Summarize this page',
      'Suggest better headings',
      'Improve clarity and tone',
      'Find accessibility issues',
    ];

    return html`
      <div class="empty-state">
        <div class="empty-title">Start a conversation</div>
        <div class="empty-actions">
          ${prompts.map((prompt) => html`
            <button
              class="welcome-btn"
              ?disabled=${this.isThinking || !this.connected}
              @click=${() => this.sendPrompt(prompt)}
            >
              ${prompt}
            </button>
          `)}
        </div>
      </div>
    `;
  }

  renderTriggerButton() {
    return html`
      <button
        class="nx-link trigger-btn ${this.isAssistantOpen ? 'active' : ''}"
        @click=${() => this.toggleAssistant()}
        aria-label="${this.isAssistantOpen ? 'Close AI Assistant' : 'Open AI Assistant'}"
        aria-expanded=${this.isAssistantOpen}
        aria-haspopup="dialog"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    `;
  }

  renderPanel() {
    return html`
      <div class="panel" role="dialog" aria-modal="true" aria-label="AI Assistant">
        <div class="panel-header">
          <h2>Assistant</h2>
          <div class="header-actions">
            <span class="status-pill ${this.connected ? 'connected' : 'disconnected'}">
              ${this.connected ? 'Connected' : 'Disconnected'}
            </span>
            <button class="clear-chat-btn" @click=${this.clearChat} title="Clear chat" aria-label="Clear chat">
              ×
            </button>
          </div>
        </div>
        <div class="messages">
          ${this.messages.length === 0 ? this.renderWelcome() : ''}
          ${this.messages.map((message, index) => html`
            <div class="message-group" data-message-index=${index}>
              ${Array.isArray(message.parts) ? message.parts.map((part) => this.renderToolPart(part)) : ''}
              ${Array.isArray(message.parts)
                ? message.parts
                  .filter((part) => part?.type === 'text' && typeof part.text === 'string' && part.text)
                  .map((part) => html`
                    <div class="message-row ${message.role}">
                      <div class="message-bubble">${part.text}</div>
                    </div>
                  `)
                : ''}
              ${(!Array.isArray(message.parts) || message.parts.length === 0) && message.content
                ? html`
                  <div class="message-row ${message.role}">
                    <div class="message-bubble">${message.content}</div>
                  </div>
                `
                : ''}
            </div>
          `)}
        </div>
        <div class="composer">
          <input
            class="composer-input"
            type="text"
            .value=${this.inputValue}
            placeholder="Send a message..."
            @input=${this.handleInput}
            @keydown=${this.handleKeyDown}
            ?disabled=${this.isThinking || !this.connected}
          />
          ${this.isThinking
            ? html`<button class="composer-btn" @click=${this.stopRequest}>Stop</button>`
            : html`<button class="composer-btn" @click=${this.sendMessage} ?disabled=${!this.inputValue.trim() || !this.connected}>Send</button>`}
        </div>
        <div class="status">${this.statusText}</div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="da-assistant">
        ${this.renderTriggerButton()}
        ${this.isAssistantOpen ? this.renderPanel() : ''}
      </div>
    `;
  }
}

if (!customElements.get('da-assistant')) {
  customElements.define('da-assistant', DaAssistant);
}

export default function init(el) {
  const assistant = document.createElement('da-assistant');
  el.append(assistant);
  return assistant;
}
