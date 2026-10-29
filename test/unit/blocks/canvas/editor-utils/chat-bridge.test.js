import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { initChatBridge } = await import('../../../../../blocks/canvas/editor-utils/chat-bridge.js');

describe('chat completion bridge', () => {
  it('bridges document notifications once without replaying them to late subscribers', () => {
    initChatBridge();
    initChatBridge();
    const received = [];
    const unsubscribe = canvasBus.chatTurnCompleted.subscribe((detail) => received.push(detail));
    const detail = { org: 'org', site: 'site', path: 'page', turnId: 'turn', status: 'completed' };
    document.dispatchEvent(new CustomEvent('nx-chat-turn-completed', { detail }));
    unsubscribe();
    expect(received).to.deep.equal([detail]);
    const late = [];
    const unsubscribeLate = canvasBus.chatTurnCompleted.subscribe((value) => late.push(value));
    expect(late).to.deep.equal([]);
    document.dispatchEvent(new CustomEvent('nx-chat-turn-completed', { detail }));
    unsubscribeLate();
    expect(late).to.deep.equal([detail]);
    expect(received).to.have.lengthOf(1);
  });
});
