import { initIms as loadIms } from '../shared/utils.js';
import { AGENT_EVENT, ROLE, TOOL_STATE } from './constants.js';
import { readStream } from './utils.js';
import { loadMessages, saveMessages, clearMessages } from './persistence.js';

// ?ref=local routes to a local da-agent dev server (port 5173).
const AGENT_URL = new URLSearchParams(window.location.search).get('ref') === 'local'
  ? 'http://localhost:4200/chat'
  : 'https://da-agent.adobeaem.workers.dev/chat';

export default class ChatController {
  constructor({ onUpdate, onToolDone }) {
    this._onUpdate = onUpdate;
    this._onToolDone = onToolDone;
  }

  setContext(context) {
    this._context = context;
    this._room = null;
  }

  _pageContextForAgent() {
    const { org, site, path, view } = this._context ?? {};
    return org && site ? { org, site, path, view } : undefined;
  }

  async _getRoom() {
    if (this._room) return this._room;
    const { userId } = await loadIms();
    const { org, site } = this._context ?? {};
    this._room = org && site && userId ? `${org}--${site}--${userId}` : 'default';
    return this._room;
  }

  async loadInitialMessages() {
    this._messages = [];
    const room = await this._getRoom();
    const cached = await loadMessages(room);
    if (!cached.length) return;
    // Strip orphaned tool-calls (assistant array-content without a tool-approval-request).
    // These are from sessions before the current fix — they have no matching tool-result
    // and cause "Tool result is missing". Complete approval sequences are kept so users
    // see what the agent approved and did in prior conversations.
    this._messages = cached.filter(
      (msg) => !(msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)
        && !msg.virtual
        && !msg.content.some((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_REQUEST)),
    );
    // Reconstruct tool cards from persisted approval messages so they render on reload.
    this._toolCards = new Map();
    for (const msg of this._messages) {
      if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)) {
        const call = msg.content.find((p) => p.type === AGENT_EVENT.TOOL_CALL);
        if (call) {
          this._toolCards.set(call.toolCallId, {
            toolName: call.toolName, input: call.input, state: TOOL_STATE.DONE,
          });
        }
      }
    }
    this._update();
  }

  _update() {
    this._onUpdate({
      messages: this._messages,
      thinking: this._thinking,
      streamingText: this._streamingText,
      connected: this._connected,
      toolCards: this._toolCards,
    });
  }

  async connect(attempt = 0) {
    try {
      await fetch(AGENT_URL, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      this._connected = true;
    } catch {
      this._connected = false;
      const delay = 1000 * 2 ** attempt;
      if (delay < 30000) this._retryTimeout = setTimeout(() => this.connect(attempt + 1), delay);
    } finally {
      this._update();
    }
  }

  _done() {
    this._abortController = null;
    this._thinking = false;
    this._streamingText = undefined;
    this._update();
  }

  stop() {
    this._abortController?.abort();
    this._done();
  }

  async clear() {
    if (this._thinking) this.stop();
    this._messages = undefined;
    this._streamingText = undefined;
    this._toolCards = new Map();
    this._autoApprovedTools = new Set();
    this._update();
    const room = await this._getRoom();
    clearMessages(room);
  }

  destroy() {
    clearTimeout(this._retryTimeout);
    this.stop();
  }

  _onToolEvent = ({
    type, toolCallId, toolName, input, output, isError, approvalId,
  }) => {
    const next = new Map(this._toolCards ?? []);

    if (type === AGENT_EVENT.TOOL_CALL) {
      if (next.has(toolCallId)) return; // duplicate — ignore
      next.set(toolCallId, { toolName, input, state: TOOL_STATE.RUNNING });
    } else if (type === AGENT_EVENT.TOOL_APPROVAL_REQUEST) {
      const autoApprove = this._autoApprovedTools?.has(toolName);
      // Promote to _messages now that we know approval is needed.
      // Both parts go in one message — resolveApprovals() matches tool-approval-request
      // to tool-call by toolCallId within the same assistant message.
      const prior = next.get(toolCallId) ?? { toolName, input: {} };
      this._messages = [
        ...this._messages,
        {
          role: ROLE.ASSISTANT,
          content: [
            {
              type: AGENT_EVENT.TOOL_CALL,
              toolCallId,
              toolName: prior.toolName,
              input: prior.input,
            },
            { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId, toolCallId },
          ],
        },
      ];
      const state = autoApprove ? TOOL_STATE.APPROVED : TOOL_STATE.APPROVAL_REQUESTED;
      next.set(toolCallId, { ...prior, state, approvalId });
      this._toolCards = next;
      this._update();
      if (autoApprove) queueMicrotask(() => this.approveToolCall(toolCallId, true));
      return;
    } else {
      const prior = next.get(toolCallId) ?? { toolName, input: {} };
      const state = isError ? TOOL_STATE.ERROR : TOOL_STATE.DONE;
      next.set(toolCallId, { ...prior, state, output });
      if (state === TOOL_STATE.DONE) {
        // Add a virtual message so the tool renders in the conversation at the right
        // position and persists across refreshes, without being sent back to the agent.
        this._messages = [
          ...this._messages,
          {
            role: ROLE.ASSISTANT,
            virtual: true,
            content: [{ type: AGENT_EVENT.TOOL_CALL, toolCallId, toolName: prior.toolName }],
          },
        ];
        this._onToolDone?.();
      }
    }

    this._toolCards = next;
    this._update();
  };

  approveToolCall = async (toolCallId, approved, always = false) => {
    const card = this._toolCards.get(toolCallId);
    if (!card?.approvalId) return;

    if (always) {
      this._autoApprovedTools ??= new Set();
      this._autoApprovedTools.add(card.toolName);
    }

    const next = new Map(this._toolCards ?? []);
    next.set(toolCallId, { ...card, state: approved ? TOOL_STATE.APPROVED : TOOL_STATE.REJECTED });
    this._toolCards = next;

    this._messages = [
      ...this._messages,
      {
        role: ROLE.TOOL,
        content: [{
          type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId: card.approvalId, approved,
        }],
      },
    ];
    this._thinking = approved;
    this._update();

    if (approved) {
      try {
        await this._stream(this._pageContextForAgent());
      } catch (err) {
        if (err.name !== 'AbortError') {
          this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: `Error: ${err.message}` }];
        }
      } finally {
        this._done();
      }
    } else {
      this._done();
    }
  };

  async _stream(pageContext) {
    const [{ accessToken }, room] = await Promise.all([loadIms(), this._getRoom()]);
    this._abortController = new AbortController();

    const resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: this._messages.filter((msg) => !msg.virtual),
        pageContext,
        context: this._pendingContext ?? [],
        imsToken: accessToken?.token ?? null,
        room,
      }),
      signal: this._abortController.signal,
    });

    this._pendingContext = [];

    if (!resp.ok) {
      throw new Error(`Agent responded with ${resp.status}: ${await resp.text()}`);
    }

    await readStream(resp.body, {
      onDelta: (next) => { this._streamingText = next; this._update(); },
      onText: (text) => {
        this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: text }];
        this._streamingText = '';
        this._update();
        saveMessages(room, this._messages);
      },
      onTool: this._onToolEvent,
    });
  }

  async sendMessage(message, context = []) {
    if (this._thinking || !this._connected) return;

    this._pendingContext = context;
    this._messages = [...(this._messages ?? []), { role: ROLE.USER, content: message }];
    this._thinking = true;
    this._update();

    this._toolCards = new Map();

    try {
      await this._stream(this._pageContextForAgent());
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._messages = [
          ...this._messages,
          { role: ROLE.ASSISTANT, content: `Error: ${err.message}` },
        ];
      }
    } finally {
      this._done();
    }
  }
}
