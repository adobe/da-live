// Test fixture mirroring da-nx's nx2/utils/chat.js (event names and AO selection).
export const CHAT_EVENT = {
  AGENT_CHANGE: 'nx-agent-change',
  TURN_COMPLETED: 'nx-chat-turn-completed',
  MESSAGE_SENT: 'nx-chat-message-sent',
  HIGHLIGHT_SELECTION: 'nx-highlight-selection',
  ADD_TO_CHAT: 'nx-add-to-chat',
};

let aoChat = async () => false;
export const useAoChat = () => aoChat();
export const setAoChat = (check) => { aoChat = check; };
