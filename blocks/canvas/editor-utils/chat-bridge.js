import { getNx } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';

const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);

let initialized = false;

export function initChatBridge() {
  if (initialized) return;
  initialized = true;
  document.addEventListener(
    CHAT_EVENT.TURN_COMPLETED || 'nx-chat-turn-completed',
    ({ detail }) => canvasBus.chatTurnCompleted.emit(detail),
  );
}
