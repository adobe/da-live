import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { getChatPanelContent, setChatPrompt, addChatContext } from '../shared/chat-panel.js';
import { loadFiles } from './utils.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { registerPanelSection, PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const { ADOBE_AI_GUIDELINES_URL, MENU_OPTIONS } = await import(`${getNx()}/blocks/shared/chat/constants.js`);
const { ADD_MENU_ITEMS } = await import(`${getNx()}/blocks/chat/constants.js`);
const { createFileDropHandlers } = await import(`${getNx()}/blocks/shared/chat/dnd.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
// PR #816 supplies live sizing; the opt-in page also works on the current shell.
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
await import(`${getNx()}/blocks/shared/menu/menu.js`);
const [shellStyle, ...styles] = await Promise.all([
  loadStyle(new URL('./shell.css', import.meta.url).href),
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

function icon(name) {
  return html`<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
}

export class DaLanding extends LitElement {
  static properties = {
    _scope: { state: true },
    _name: { state: true },
    _files: { state: true },
    _error: { state: true },
    _profileError: { state: true },
    _prompt: { state: true },
    _chatEnabled: { state: true },
    _editor: { state: true },
    _chatError: { state: true },
    _handingOff: { state: true },
    _dragging: { state: true },
    _permissions: { state: true },
  };

  _sizing = sizing && new sizing.UISizeController(this);

  _dnd = createFileDropHandlers({
    onDragging: (dragging) => { this._dragging = dragging; },
    onFiles: (files) => this.addFiles(files),
  });

  constructor() {
    super();
    this._prompt = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    this._unsubscribe = hashChange.subscribe((state) => this.setScope(state));
    this.loadProfile();
  }

  disconnectedCallback() {
    this._dragging = false;
    this._unsubscribe?.();
    this._request?.abort();
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
    super.disconnectedCallback();
  }

  get uiSize() {
    return sizing?.getUISize() === 'm' ? 'm' : 's';
  }

  get path() {
    return this._scope ? `/${this._scope}` : '';
  }

  updated() {
    if (!this._prompt) this.shadowRoot.querySelector('textarea')?.style.removeProperty('height');
  }

  async loadImsProfile() {
    const { loadIms } = await import(`${getNx()}/utils/ims.js`);
    return loadIms();
  }

  async loadProfile() {
    try {
      const profile = await this.loadImsProfile();
      if (this.isConnected) this._name = profile?.first_name || profile?.displayName?.split(' ')[0];
    } catch {
      if (this.isConnected) this._profileError = 'Your profile could not be loaded.';
    }
  }

  setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (this._scope === scope && this._request && !this._request.signal.aborted) return;
    this._scope = scope;
    this._permissions = undefined;
    this._prompt = '';
    this._chatEnabled = undefined;
    this._editor = undefined;
    this._chatError = undefined;
    this._handingOff = false;
    this._dragging = false;
    this._error = undefined;
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
    this.loadSite();
  }

  async loadSite() {
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._files = undefined;
    this._permissions = undefined;
    this._error = undefined;
    if (!this._scope) return;
    this.loadChatAvailability(request);
    try {
      const { source } = await getNx2Api();
      const { signal } = request;
      const { files, permissions } = await loadFiles({ path: this.path, source, signal });
      if (!this.isConnected || request.signal.aborted) return;
      this._files = files;
      this._permissions = permissions;
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  async loadChatAvailability(request) {
    const [org, site] = this._scope.split('/');
    try {
      const { isEWEnabled, isEwChatDisabled } = await getNxEWFlags();
      const [enabled, disabled] = await Promise.all([
        isEWEnabled({ org, site }), isEwChatDisabled({ org, site }),
      ]);
      if (request.signal.aborted || !this.isConnected) return;
      this._editor = enabled ? '/canvas#' : '/edit#';
      this._chatEnabled = enabled && !disabled;
      if (!this._chatEnabled) return;
      registerPanelSection('chat', {
        position: 'before',
        width: '400px',
        getContent: async () => {
          try {
            return await getChatPanelContent()();
          } catch (error) {
            this._chatError = `Could not open the assistant: ${error.message}`;
            this._handingOff = false;
            throw error;
          }
        },
        onShow: async (aside, id, options) => {
          if (!options || request.signal.aborted) return;
          try {
            const chat = aside.querySelector('nx-chat, nx-chat-ao');
            if (!chat) throw new Error('The assistant could not be opened.');
            await chat.updateComplete;
            if (request.signal.aborted || !this.isConnected) return;
            if (options.autoSend && chat.thinking && !chat.pendingPlanApproval) {
              throw new Error('The assistant is still responding. Try again when it finishes.');
            }
            if (options.text) await chat.setPrompt(options.text, { autoSend: options.autoSend });
            for (const item of options.attachments || []) await addChatContext(item);
            if (options.action) {
              if (!chat.openAddAction) throw new Error('This assistant cannot open the selected Add action.');
              await chat.openAddAction(options.action);
            }
            options.onReady?.();
          } catch (error) {
            if (!request.signal.aborted) this._chatError = error.message;
          } finally {
            if (!request.signal.aborted) this._handingOff = false;
          }
        },
      });
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) {
        this._chatEnabled = false;
        this._chatError = `Could not load the assistant: ${error.message}`;
      }
    }
  }

  async submitPrompt(event) {
    event.preventDefault();
    await this.openAssistant({ text: this._prompt.trim(), autoSend: true });
  }

  async openAssistant({ text, action, attachments, autoSend }) {
    if (!this._chatEnabled || this._handingOff) return;
    if (!text && !action && !attachments?.length) return;
    this._handingOff = true;
    this._chatError = undefined;
    try {
      const scope = this._scope;
      const onReady = () => {
        if (this._scope !== scope) return;
        this._prompt = '';
        this._handingOff = false;
      };
      if (autoSend || action || attachments?.length) {
        document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat', options: { text, action, attachments, autoSend, onReady } } }));
      } else {
        await setChatPrompt(text, onReady);
      }
    } catch (error) {
      this._handingOff = false;
      this._chatError = `Could not open the assistant: ${error.message}`;
    }
  }

  selectAddAction({ detail: { id } }) {
    if (id === MENU_OPTIONS.FILES) {
      this.shadowRoot.querySelector('.landing-file-input').click();
      return undefined;
    }
    return this.openAssistant({ text: this._prompt.trim(), action: id });
  }

  async attachFiles({ target }) {
    try {
      await this.addFiles([...target.files]);
    } finally {
      target.value = '';
    }
  }

  handleFileDrag(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return undefined;
    event.preventDefault();
    if (!this._chatEnabled || this._handingOff) {
      this._dragging = false;
      event.dataTransfer.dropEffect = 'none';
      return undefined;
    }
    const handlers = {
      dragenter: this._dnd.onDragEnter,
      dragleave: this._dnd.onDragLeave,
      dragover: this._dnd.onDragOver,
      drop: this._dnd.onDrop,
    };
    return handlers[event.type](event);
  }

  async addFiles(files) {
    if (!this._chatEnabled || this._handingOff) return;
    if (!files.length) return;
    const scope = this._scope;
    try {
      if (files.some((file) => !file.type?.startsWith('image/')
        && !['application/pdf', 'text/markdown'].includes(file.type)
        && !file.name?.endsWith('.md'))) {
        throw new Error('Use images, PDFs or Markdown files.');
      }
      const { buildAttachmentItems } = await import(`${getNx()}/blocks/shared/chat/files.js`);
      const attachments = await buildAttachmentItems(files);
      if (this._scope !== scope || !this.isConnected) return;
      if (attachments.length !== files.length) throw new Error('Some files could not be read or exceed the attachment limit.');
      await this.openAssistant({ text: this._prompt.trim(), attachments });
    } catch (error) {
      if (this._scope === scope && this.isConnected) {
        this._chatError = `Could not attach files: ${error.message}`;
      }
    }
  }

  updatePrompt({ target }) {
    this._prompt = target.value;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
  }

  render() {
    return html`
      <div class="landing">
        <section class="welcome" aria-labelledby="welcome-heading">
          <h1 id="welcome-heading">Hi${this._name ? html` ${this._name}` : nothing}, how can I help?</h1>
          <form class="composer ${this._dragging && this._chatEnabled && !this._handingOff ? 'is-dropzone' : ''}"
            @submit=${this.submitPrompt} @dragenter=${this.handleFileDrag}
            @dragleave=${this.handleFileDrag} @dragover=${this.handleFileDrag}
            @drop=${this.handleFileDrag}>
            <div class="composer-surface" aria-hidden="true"></div>
            <div class="composer-input">
              <span class="coworker-icon" aria-hidden="true"></span>
              <label class="sr-only" for="landing-prompt">Let me know your task</label>
              <textarea id="landing-prompt" rows="1" .value=${this._prompt}
                ?disabled=${!this._chatEnabled || this._handingOff} aria-describedby="assistant-note assistant-context"
                placeholder="Let me know your task — I can route you to the right app or tool"
                @input=${this.updatePrompt}></textarea>
            </div>
            <div class="composer-actions">
              <input class="landing-file-input" type="file" hidden multiple
                accept="image/*,application/pdf,text/markdown,.md"
                ?disabled=${!this._chatEnabled || this._handingOff} @change=${this.attachFiles}>
              <nx-menu .items=${ADD_MENU_ITEMS} placement="above" @select=${this.selectAddAction}>
                <button slot="trigger" type="button"
                  class="chat-add nx-action-btn-icon ${this.uiSize === 'm' ? 'nx-btn-lg' : ''}"
                  aria-label="Add" ?disabled=${!this._chatEnabled || this._handingOff}>
                  ${icon('add')}
                </button>
              </nx-menu>
              <button type="submit" class="composer-send nx-action-btn-icon is-active ${this.uiSize === 'm' ? 'nx-btn-lg' : ''}"
                aria-label=${this._handingOff ? 'Opening chat' : 'Send message'}
                title="Send message"
                ?disabled=${!this._chatEnabled || !this._prompt.trim() || this._handingOff}>${icon('arrowupsend')}</button>
            </div>
          </form>
          <p id="assistant-note" class="assistant-note">
            AI responses may be inaccurate.
            <a href=${ADOBE_AI_GUIDELINES_URL} target="_blank" rel="noopener noreferrer">AI User Guidelines</a>
          </p>
          <p id="assistant-context" class="sr-only">
            ${this._scope ? `Working in ${this._scope}. Send opens your site assistant and starts the conversation.` : 'Choose a site to use the assistant.'}
          </p>
          ${this._chatError || (this._scope && this._chatEnabled === false) ? html`
            <p class="assistant-note" role="status">${this._chatError || 'The assistant is not enabled for this site.'}</p>` : nothing}
          ${this._profileError ? html`<p class="assistant-note" role="status">${this._profileError}</p>` : nothing}
        </section>
      </div>`;
  }
}

customElements.define('da-landing', DaLanding);

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(shellStyle)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, shellStyle];
  }
  const landing = document.createElement('da-landing');
  if (new URLSearchParams(window.location.search).get('theme') === 'light') {
    landing.dataset.theme = 'light';
  }
  el.replaceChildren(landing);
}
