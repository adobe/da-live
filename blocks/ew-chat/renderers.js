import { html, nothing } from 'da-lit';
import { AGENT_EVENT, ROLE, TOOL_INPUT, TOOL_STATE } from './constants.js';
import { getNx } from '../shared/nxutils.js';

const { unified, remarkParse } = await import(`${getNx()}/deps/mdast/dist/index.js`);

function renderNode(node) {
  switch (node.type) {
    case 'root':
      return node.children.map(renderNode);
    case 'paragraph':
      return html`<p>${node.children.map(renderNode)}</p>`;
    case 'heading':
      return html`<h${node.depth}>${node.children.map(renderNode)}</h${node.depth}>`;
    case 'list':
      return node.ordered
        ? html`<ol>${node.children.map(renderNode)}</ol>`
        : html`<ul>${node.children.map(renderNode)}</ul>`;
    case 'listItem': {
      const children = node.spread
        ? node.children.map(renderNode)
        : node.children.flatMap((c) => (c.type === 'paragraph' ? c.children.map(renderNode) : [renderNode(c)]));
      return html`<li>${children}</li>`;
    }
    case 'strong':
      return html`<strong>${node.children.map(renderNode)}</strong>`;
    case 'emphasis':
      return html`<em>${node.children.map(renderNode)}</em>`;
    case 'inlineCode':
      return html`<code>${node.value}</code>`;
    case 'link':
      return html`<a href="${node.url}" target="_blank" rel="noopener noreferrer">${node.children.map(renderNode)}</a>`;
    case 'text':
      return node.value;
    default:
      return nothing;
  }
}

const parser = unified().use(remarkParse);

function renderMessageContent(text) {
  if (!text) return nothing;
  const tree = parser.parse(text);
  return renderNode(tree);
}

function approvalSummary(input) {
  if (!input) return null;
  const {
    HUMAN_READABLE_SUMMARY, SOURCE_PATH, DESTINATION_PATH, PATH, SKILL_ID, NAME,
  } = TOOL_INPUT;
  return input[HUMAN_READABLE_SUMMARY]
    ?? (input[SOURCE_PATH] && input[DESTINATION_PATH] ? `${input[SOURCE_PATH]} → ${input[DESTINATION_PATH]}` : null)
    ?? input[PATH] ?? input[SKILL_ID] ?? input[NAME] ?? null;
}

function renderToolCard(toolCallId, toolCards) {
  const card = toolCards?.get(toolCallId);
  if (!card || card.state === TOOL_STATE.APPROVAL_REQUESTED) return nothing;
  const { toolName, state, input } = card;
  const detail = approvalSummary(input);
  const failed = state === TOOL_STATE.ERROR || state === TOOL_STATE.REJECTED;
  return html`
    <details class="tool-card tool-card-${state}">
      <summary>${toolName}${failed ? html`<span class="tool-card-status">${state}</span>` : nothing}</summary>
      ${detail ? html`<span class="tool-card-detail">${detail}</span>` : nothing}
    </details>
  `;
}

function renderApprovalCard(pending, onApprove) {
  if (!pending) return nothing;
  const { toolCallId, toolName, input } = pending;
  const summary = approvalSummary(input);
  return html`
    <div class="approval-actions">
      <span class="approval-tool-name">${toolName}</span>
      ${summary ? html`<span class="approval-summary">${summary}</span>` : nothing}
      <div class="approval-buttons">
        <button type="button" class="secondary-btn" @click=${() => onApprove(toolCallId, false)}>
          <span>Reject</span><kbd>Esc</kbd>
        </button>
        <button type="button" class="secondary-btn" @click=${() => onApprove(toolCallId, true, true)}>
          <span>Always approve</span><kbd>⌘↵</kbd>
        </button>
        <button type="button" class="action-btn" @click=${() => onApprove(toolCallId, true)}>
          <span>Approve</span><kbd>↵</kbd>
        </button>
      </div>
    </div>
  `;
}

function renderMessage(msg, icons, toolCards) {
  if (msg.role === ROLE.TOOL) return nothing;
  const isAssistant = msg.role === ROLE.ASSISTANT;

  // Assistant message with tool-call parts (array content)
  if (isAssistant && Array.isArray(msg.content)) {
    return html`${msg.content.map((part) => (part.type === AGENT_EVENT.TOOL_CALL
      ? renderToolCard(part.toolCallId, toolCards)
      : nothing))}`;
  }

  const copy = isAssistant && !msg.streaming
    ? html`<button class="message-action-copy" @click=${() => navigator.clipboard.writeText(msg.content)} aria-label="Copy">
      </button>`
    : nothing;

  return html`
    <div class="message message-${msg.role}">
      <div class="message-content">${isAssistant ? renderMessageContent(msg.content) : msg.content}</div>
      ${copy}
    </div>
  `;
}

export { renderMessage, renderApprovalCard };
