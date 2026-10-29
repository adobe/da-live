// Test fixture mirroring da-nx's nx2/utils/chat.js (CHAT_EVENT only — da-live only
// consumes the event-name constants, not chat's other utilities).
export const CHAT_EVENT = {
  AGENT_CHANGE: 'nx-agent-change',
  HIGHLIGHT_SELECTION: 'nx-highlight-selection',
  INPUT_STATE_CHANGE: 'nx-chat-input-state-change',
  ADD_TO_CHAT: 'nx-add-to-chat',
};

export async function loadChat() {
  return document.createElement('nx-chat');
}

export const chatConfig = { useAo: false, altHarness: false };

export async function loadChatInput() {
  await chatConfig.inputReady;
  if (!chatConfig.useAo) return undefined;
  const input = document.createElement('nx-ao-input');
  input.altHarness = chatConfig.altHarness;
  return input;
}
