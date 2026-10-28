import { getNx, getNxEWFlags } from '../../scripts/utils.js';
import { createChannel } from './channel.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const availabilityChannel = createChannel({ replay: true });
let chatContext;
let unsubscribeHash;

async function syncChatAvailability({ org, site } = {}) {
  if (chatContext && chatContext.org === org && chatContext.site === site) return;
  const context = { org, site };
  chatContext = context;
  availabilityChannel.emit(undefined);
  const enabled = org
    ? await getNxEWFlags().then((flags) => flags.isEwChatEnabled(context)).catch(() => false)
    : false;
  if (chatContext === context) availabilityChannel.emit(enabled);
}

// Undefined availability means the current org/site is still being checked.
export const chatAvailability = Object.freeze({
  subscribe(callback) {
    if (!availabilityChannel.subscriberCount) {
      unsubscribeHash = hashChange.subscribe(syncChatAvailability);
    }
    const unsubscribe = availabilityChannel.subscribe(callback);
    return () => {
      unsubscribe();
      if (availabilityChannel.subscriberCount) return;
      unsubscribeHash?.();
      unsubscribeHash = undefined;
      chatContext = undefined;
      availabilityChannel.emit(undefined);
    };
  },
});

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

let panelEventsPromise;
const panelEvents = () => {
  panelEventsPromise ??= import(`${getNx()}/utils/panel.js`);
  return panelEventsPromise;
};

export async function setChatPrompt(text, onReady) {
  if (!text) return;
  const { PANEL_EVENT } = await panelEvents();
  const detail = { section: 'chat', options: { text, onReady } };
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail }));
}

export async function addChatContext(item) {
  const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
  document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, { detail: item }));
}
