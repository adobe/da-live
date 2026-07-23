import { getNx2 } from '../../scripts/utils.js';

// nx-chat's own public event constants — see da-nx's docs/chat-ui-component.md.
export const { CHAT_EVENT } = await import(`${getNx2()}/blocks/chat/constants.js`);
