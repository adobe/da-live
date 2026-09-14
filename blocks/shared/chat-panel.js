import { getNx } from '../../scripts/utils.js';

// Shared getContent for registering the default chat panel section — used by every
// da-live host page (canvas, browse). Host pages keep full control of
// position/width/onShow; only this identical mount-the-default-chat-element piece
// is shared. Which element that actually is (nx-chat vs nx-chat-ao) is da-nx's call.
export function getChatPanelContent() {
  return async () => {
    const { loadChat } = await import(`${getNx()}/utils/chat.js`);
    return loadChat();
  };
}
