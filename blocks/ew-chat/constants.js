const MENU_OPTIONS = {
  PROMPT: 'prompt',
};

const ADD_MENU_ITEMS = [
  { section: 'Add' },
  { id: 'files', label: 'Files or images', icon: 'Link' },
  { id: MENU_OPTIONS.PROMPT, label: 'Prompt', icon: 'CommentText' },
  { id: 'command', label: '"/" Command', icon: 'Prompt' },
  { divider: true },
  { id: 'prompts', label: 'Manage Prompts' },
  { id: 'skills', label: 'Manage Skills' },
];

const CHAT_ICONS = {
  add: 'Add', clear: 'RemoveCircle', close: 'SplitLeft', send: 'ArrowUpSend', stop: 'Stop', up: 'ChevronUp',
};

/**
 * Agent stream event types.
 * Source: Vercel AI SDK v6 UIMessageStream format, as emitted by da-agent.
 * TODO: move to a shared @da/agent-types package so both sides import from one place.
 */
const AGENT_EVENT = {
  TEXT_DELTA: 'text-delta',
  TEXT_END: 'text-end',
  FINISH: 'finish',
  FINISH_MESSAGE: 'finish-message',
  ERROR: 'error',
  // tool-input-available is the legacy alias for tool-call
  TOOL_CALL: 'tool-call',
  TOOL_CALL_LEGACY: 'tool-input-available',
  // tool-output-available is the legacy alias for tool-result
  TOOL_RESULT: 'tool-result',
  TOOL_RESULT_LEGACY: 'tool-output-available',
  TOOL_APPROVAL_REQUEST: 'tool-approval-request',
  TOOL_APPROVAL_RESPONSE: 'tool-approval-response',
};

const TOOL_STATE = {
  RUNNING: 'running',
  APPROVAL_REQUESTED: 'approval-requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DONE: 'done',
  ERROR: 'error',
};

/**
 * Input field names used in tool approval summary rendering.
 * These are da-agent tool input schema field names — part of the agent-client contract.
 * TODO: move to @da/agent-types once the agent team can publish one.
 */
const TOOL_INPUT = {
  HUMAN_READABLE_SUMMARY: 'humanReadableSummary',
  SOURCE_PATH: 'sourcePath',
  DESTINATION_PATH: 'destinationPath',
  PATH: 'path',
  SKILL_ID: 'skillId',
  NAME: 'name',
};

const ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
};

export {
  ADD_MENU_ITEMS, AGENT_EVENT, CHAT_ICONS, MENU_OPTIONS, ROLE, TOOL_INPUT, TOOL_STATE,
};
