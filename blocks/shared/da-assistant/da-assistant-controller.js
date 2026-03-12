import { AgentClient, agentFetch } from '../../../deps/agent/dist/index.js';

const MESSAGE_TYPE = {
  CHAT_REQUEST: 'cf_agent_use_chat_request',
  CHAT_RESPONSE: 'cf_agent_use_chat_response',
  CHAT_REQUEST_CANCEL: 'cf_agent_chat_request_cancel',
  CHAT_MESSAGES: 'cf_agent_chat_messages',
  MESSAGE_UPDATED: 'cf_agent_message_updated',
  CHAT_CLEAR: 'cf_agent_chat_clear',
  TOOL_APPROVAL: 'cf_agent_tool_approval',
};

function normalizePath(path) {
  if (typeof path !== 'string') return '';
  return path
    .trim()
    .split('?')[0]
    .split('#')[0]
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');
}

function getToolName(part) {
  if (typeof part?.toolName === 'string' && part.toolName) return part.toolName;
  if (typeof part?.type === 'string' && part.type.startsWith('tool-')) {
    return part.type.replace('tool-', '');
  }
  return '';
}

function getPathFromToolPart(part) {
  if (part?.output && typeof part.output === 'object') {
    if (typeof part.output.path === 'string') return part.output.path;
    if (typeof part.output?.data?.path === 'string') return part.output.data.path;
  }
  if (part?.input && typeof part.input === 'object' && typeof part.input.path === 'string') {
    return part.input.path;
  }
  return '';
}

function isToolOutputSuccess(part) {
  if (!part?.output || typeof part.output !== 'object') return false;
  if (part.output.error) return false;
  if ('success' in part.output) return part.output.success === true;
  return true;
}

function extractTextFromParts(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

function extractReasoningFromParts(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => part?.type === 'reasoning' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function normalizeMessage(message) {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const content = extractTextFromParts(parts)
    || (typeof message?.content === 'string' ? message.content : '');
  return {
    id: message?.id,
    role: message?.role === 'user' ? 'user' : 'assistant',
    content,
    parts,
  };
}

export class ChatController {
  constructor(options = {}) {
    this.agentName = options.agent || 'ChatAgent';
    this.host = options.host || 'localhost:5173';
    this.getContext = options.getContext || (() => ({}));
    this.getImsToken = options.getImsToken || (() => null);

    this.onUpdate = options.onUpdate || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onConnectionChange = options.onConnectionChange || (() => {});
    this.onDocumentUpdated = options.onDocumentUpdated || (() => {});

    this.agent = null;
    this.messages = [];
    this.connected = false;
    this.isThinking = false;
    this.statusText = '';

    this.currentRequestId = null;
    this.activeAssistantIndex = null;
    this.processedUpdateToolCalls = new Set();

    this._onAgentOpen = this.handleAgentOpen.bind(this);
    this._onAgentClose = this.handleAgentClose.bind(this);
    this._onAgentMessage = this.handleAgentMessage.bind(this);
  }

  connect() {
    if (this.agent) return;

    this.agent = new AgentClient({ agent: this.agentName, host: this.host });
    this.agent.addEventListener('open', this._onAgentOpen);
    this.agent.addEventListener('close', this._onAgentClose);
    this.agent.addEventListener('message', this._onAgentMessage);
  }

  disconnect() {
    if (!this.agent) return;

    this.agent.removeEventListener('open', this._onAgentOpen);
    this.agent.removeEventListener('close', this._onAgentClose);
    this.agent.removeEventListener('message', this._onAgentMessage);
    this.agent = null;

    this.connected = false;
    this.isThinking = false;
    this.currentRequestId = null;
    this.activeAssistantIndex = null;
    this.statusText = 'Disconnected';

    this.onConnectionChange(false);
    this.onStatusChange(this.statusText);
    this.onUpdate();
  }

  handleAgentOpen() {
    this.connected = true;
    this.statusText = 'Connected';
    this.onConnectionChange(true);
    this.onStatusChange(this.statusText);
    this.onUpdate();

    this.loadInitialMessages();
  }

  handleAgentClose() {
    this.connected = false;
    this.statusText = 'Disconnected';
    this.onConnectionChange(false);
    this.onStatusChange(this.statusText);
    this.onUpdate();
  }

  handleAgentMessage(event) {
    if (typeof event.data !== 'string') return;

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    if (!data || typeof data !== 'object') return;

    if (
      data.type === MESSAGE_TYPE.CHAT_RESPONSE
      && (data.id === this.currentRequestId || this.isThinking)
    ) {
      if (typeof data.body === 'string' && data.body.trim()) {
        this.applyChatResponseBody(data.body);
      }

      if (data.error) {
        this.isThinking = false;
        this.currentRequestId = null;
        this.statusText = 'Error';
        this.onStatusChange(this.statusText);
        this.onUpdate();
      } else if (data.done) {
        this.isThinking = false;
        this.currentRequestId = null;
        this.statusText = 'Complete';
        this.onStatusChange(this.statusText);
        this.onUpdate();
      }
      return;
    }

    if (data.type === MESSAGE_TYPE.MESSAGE_UPDATED && data.message) {
      this.updateAssistantFromMessage(data.message);
      return;
    }

    if (data.type === MESSAGE_TYPE.CHAT_MESSAGES && Array.isArray(data.messages)) {
      this.syncMessagesFromAgent(data.messages);
      return;
    }

    if (data.type === MESSAGE_TYPE.CHAT_CLEAR) {
      this.messages = [];
      this.activeAssistantIndex = null;
      this.processedUpdateToolCalls.clear();
      this.onUpdate();
    }
  }

  applyChatResponseBody(body) {
    let chunk;
    try {
      chunk = JSON.parse(body);
    } catch (e) {
      this.appendToActiveAssistantMessage(body);
      return;
    }

    if (!chunk || typeof chunk !== 'object') return;

    if (chunk.message) {
      this.updateAssistantFromMessage(chunk.message);
      return;
    }

    if (typeof chunk.type === 'string' && chunk.type.includes('reasoning')) {
      const reasoningText = (typeof chunk.delta === 'string' && chunk.delta)
        || (typeof chunk.text === 'string' && chunk.text)
        || (typeof chunk.reasoning === 'string' && chunk.reasoning)
        || '';
      if (reasoningText) {
        this.statusText = 'Reasoning ...';
        this.onStatusChange(this.statusText);
        this.onUpdate();
      }
      return;
    }

    if (
      chunk.type === 'text-delta'
      || chunk.type === 'text'
      || chunk.type === 'delta'
      || chunk.type === 'response.output_text.delta'
    ) {
      const textDelta = (typeof chunk.delta === 'string' && chunk.delta)
        || (typeof chunk.text === 'string' && chunk.text)
        || '';
      if (textDelta) this.appendToActiveAssistantMessage(textDelta);
      return;
    }

    if (chunk.part && typeof chunk.part === 'object') {
      if (chunk.part.type === 'reasoning' && typeof chunk.part.text === 'string') {
        this.statusText = 'Reasoning ...';
        this.onStatusChange(this.statusText);
        this.onUpdate();
        return;
      }
      if (chunk.part.type === 'text' && typeof chunk.part.text === 'string') {
        this.appendToActiveAssistantMessage(chunk.part.text);
        return;
      }
    }

    if (Array.isArray(chunk.parts)) {
      const text = extractTextFromParts(chunk.parts);
      if (text) this.appendToActiveAssistantMessage(text);
      const reasoning = extractReasoningFromParts(chunk.parts);
      if (reasoning) {
        this.statusText = 'Reasoning ...';
        this.onStatusChange(this.statusText);
        this.onUpdate();
      }
    }
  }

  ensureAssistantPlaceholder() {
    if (this.activeAssistantIndex !== null) return;
    this.messages = [...this.messages, {
      role: 'assistant',
      content: '...',
      parts: [{ type: 'text', text: '...' }],
    }];
    this.activeAssistantIndex = this.messages.length - 1;
  }

  appendToActiveAssistantMessage(text) {
    if (!text) return;
    this.ensureAssistantPlaceholder();

    const idx = this.activeAssistantIndex;
    if (idx === null) return;

    const next = [...this.messages];
    const current = next[idx]?.content || '';
    const base = current === '...' ? '' : current;
    const content = `${base}${text}`;
    const existingParts = Array.isArray(next[idx]?.parts) ? next[idx].parts : [];
    let textPartUpdated = false;
    const parts = existingParts.map((part) => {
      if (!textPartUpdated && part?.type === 'text') {
        textPartUpdated = true;
        return { ...part, text: content };
      }
      return part;
    });
    if (!textPartUpdated) {
      parts.push({ type: 'text', text: content });
    }
    next[idx] = {
      ...next[idx],
      role: 'assistant',
      content,
      parts,
    };
    this.messages = next;
    this.notifyDocumentUpdated(normalized.parts);
    this.onUpdate();
  }

  notifyDocumentUpdated(parts) {
    if (!Array.isArray(parts)) return;

    const context = this.getContext();
    if (context?.view !== 'edit') return;
    const currentPath = normalizePath(context.path || '');
    if (!currentPath) return;

    parts.forEach((part) => {
      if (!part || typeof part !== 'object') return;
      if (part.state !== 'output-available') return;

      const toolName = getToolName(part);
      if (toolName !== 'da_update_source') return;
      if (!isToolOutputSuccess(part)) return;

      const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : '';
      if (toolCallId && this.processedUpdateToolCalls.has(toolCallId)) return;

      const targetPath = normalizePath(getPathFromToolPart(part));
      if (!targetPath || targetPath !== currentPath) return;

      if (toolCallId) this.processedUpdateToolCalls.add(toolCallId);

      this.onDocumentUpdated({
        toolName,
        toolCallId,
        path: targetPath,
      });
    });
  }

  updateAssistantFromMessage(message) {
    const normalized = normalizeMessage(message);
    const reasoning = extractReasoningFromParts(normalized.parts);
    if (!normalized.content && normalized.parts.length === 0) return;
    if (message.role === 'user') return;

    const next = [...this.messages];
    const updatedToolCallIds = new Set(
      normalized.parts
        .filter((part) => part && typeof part === 'object' && part.toolCallId)
        .map((part) => part.toolCallId),
    );

    let replaceIndex = -1;

    if (normalized.id) {
      replaceIndex = next.findIndex((msg) => msg.id === normalized.id);
    }

    if (replaceIndex < 0 && updatedToolCallIds.size > 0) {
      replaceIndex = next.findIndex((msg) => (
        Array.isArray(msg.parts)
        && msg.parts.some((part) => part && updatedToolCallIds.has(part.toolCallId))
      ));
    }

    if (replaceIndex < 0 && this.activeAssistantIndex !== null) {
      const active = next[this.activeAssistantIndex];
      const isPlaceholder = !!active
        && active.role === 'assistant'
        && (active.content === '...' || !active.content)
        && !active.id;
      if (isPlaceholder) {
        replaceIndex = this.activeAssistantIndex;
      }
    }

    if (replaceIndex >= 0) {
      const existing = next[replaceIndex];
      next[replaceIndex] = {
        ...existing,
        ...normalized,
        content: normalized.content || existing?.content || '',
        parts: normalized.parts?.length > 0 ? normalized.parts : (existing?.parts || []),
        id: existing?.id || normalized.id,
      };
      this.activeAssistantIndex = replaceIndex;
    } else {
      next.push({
        ...normalized,
        id: normalized.id || crypto.randomUUID(),
      });
      this.activeAssistantIndex = next.length - 1;
    }

    if (reasoning) {
      this.statusText = 'Reasoning ...';
      this.onStatusChange(this.statusText);
    }

    this.messages = next;
    this.notifyDocumentUpdated(normalized.parts);
    this.onUpdate();
  }

  syncMessagesFromAgent(agentMessages) {
    const nextMessages = [];

    agentMessages.forEach((message) => {
      const normalized = normalizeMessage(message);
      if (!normalized.content && normalized.parts.length === 0) return;
      nextMessages.push(normalized);
    });

    this.messages = nextMessages;
    this.activeAssistantIndex = null;
    this.onUpdate();
  }

  async loadInitialMessages() {
    try {
      const response = await agentFetch(
        { agent: this.agentName, host: this.host, path: 'get-messages' },
        { method: 'GET', headers: { 'content-type': 'application/json' } },
      );
      if (!response.ok) return;

      const text = await response.text();
      if (!text.trim()) return;

      const messages = JSON.parse(text);
      if (!Array.isArray(messages)) return;
      this.syncMessagesFromAgent(messages);
    } catch {
      // Ignore initial load failures.
    }
  }

  toAgentMessages() {
    return this.messages
      .filter((message) => (
        (
          typeof message.content === 'string'
          && message.content.trim().length > 0
          && message.content !== '...'
        )
        || extractTextFromParts(message.parts).trim().length > 0
      ))
      .map((message, index) => ({
        id: message.id || `da-local-${index}`,
        role: message.role,
        parts: Array.isArray(message.parts) && message.parts.length > 0
          ? message.parts
          : [{ type: 'text', text: message.content || '' }],
      }));
  }

  sendMessage(text) {
    const content = (text || '').trim();
    if (!content || this.isThinking || !this.agent) return;

    this.messages = [...this.messages, {
      role: 'user',
      content,
      parts: [{ type: 'text', text: content }],
    }];
    this.isThinking = true;
    this.statusText = 'Thinking...';
    this.currentRequestId = crypto.randomUUID().slice(0, 8);
    this.activeAssistantIndex = null;
    this.ensureAssistantPlaceholder();

    this.onStatusChange(this.statusText);
    this.onUpdate();

    try {
      this.agent.send(JSON.stringify({
        id: this.currentRequestId,
        init: {
          method: 'POST',
          body: JSON.stringify({
            messages: this.toAgentMessages(),
            pageContext: this.getContext(),
            imsToken: this.getImsToken(),
          }),
        },
        type: MESSAGE_TYPE.CHAT_REQUEST,
      }));
    } catch (e) {
      this.isThinking = false;
      this.currentRequestId = null;
      this.statusText = 'Error';
      const errorText = `Error: ${e.message || 'Failed to send message'}`;
      this.messages = [...this.messages, {
        role: 'assistant',
        content: errorText,
        parts: [{ type: 'text', text: errorText }],
      }];
      this.onStatusChange(this.statusText);
      this.onUpdate();
    }
  }

  stop() {
    if (!this.agent || !this.currentRequestId) return;

    this.agent.send(JSON.stringify({
      id: this.currentRequestId,
      type: MESSAGE_TYPE.CHAT_REQUEST_CANCEL,
    }));

    this.currentRequestId = null;
    this.isThinking = false;
    this.statusText = 'Stopped';

    this.onStatusChange(this.statusText);
    this.onUpdate();
  }

  clearHistory() {
    this.messages = [];
    this.activeAssistantIndex = null;
    this.currentRequestId = null;
    this.isThinking = false;
    this.statusText = '';
    this.processedUpdateToolCalls.clear();

    if (this.agent) {
      this.agent.send(JSON.stringify({ type: MESSAGE_TYPE.CHAT_CLEAR }));
    }

    this.onStatusChange(this.statusText);
    this.onUpdate();
  }

  findToolCallIdByApprovalId(approvalId) {
    if (!approvalId) return null;

    for (const message of this.messages) {
      if (!Array.isArray(message.parts)) {
        // Skip messages without structured parts.
      } else {
        for (const part of message.parts) {
          if (
            part
            && typeof part === 'object'
            && part.toolCallId
            && part.approval
            && part.approval.id === approvalId
          ) {
            return part.toolCallId;
          }
        }
      }
    }

    return null;
  }

  addToolApprovalResponse({ id, approved }) {
    if (!this.agent) return;

    const toolCallId = this.findToolCallIdByApprovalId(id);
    if (!toolCallId) return;

    this.agent.send(JSON.stringify({
      type: MESSAGE_TYPE.TOOL_APPROVAL,
      toolCallId,
      approved: !!approved,
      autoContinue: true,
    }));
  }
}

export default ChatController;
