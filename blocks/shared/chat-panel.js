import { getNx } from '../../scripts/utils.js';

// Shared getContent for registering nx-chat as a panel section — used by every
// da-live host page (canvas, browse) that mounts the default chat panel. Host
// pages keep full control of position/width/onShow; only this identical
// mount-the-default-chat-element piece is shared.
export function getChatPanelContent() {
  return async () => {
    await import(`${getNx()}/blocks/chat/chat.js`);
    return document.createElement('nx-chat');
  };
}
