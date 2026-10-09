import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { initVersionBridge } from '../../../../../blocks/canvas/editor-utils/version-bridge.js';
import { VERSION_EVENT } from '../../../../fixtures/nx2/utils/version-events.js';

describe('version-bridge', () => {
  it('forwards version creation onto the canvas bus exactly once', () => {
    initVersionBridge();
    initVersionBridge();
    const received = [];
    const unsubscribe = canvasBus.versionCreatedState.subscribe((detail) => received.push(detail));
    const detail = { path: '/org/site/page.html' };
    document.dispatchEvent(new CustomEvent(VERSION_EVENT.CREATED, { detail }));
    unsubscribe();
    expect(received).to.deep.equal([detail]);
  });
});
