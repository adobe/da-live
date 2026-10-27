import { expect } from '@esm-bundle/chai';
import { initBranchBridge } from '../../../../../blocks/canvas/editor-utils/branch-bridge.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

// No setNx() and no Nexter modules: an old/pinned release must not block startup.
describe('branch bridge without the new Nexter module', () => {
  it('starts and publishes the stable wire protocol without loading Nexter', () => {
    const events = [];
    const onState = ({ detail }) => events.push(detail);
    document.addEventListener('nx-branch-state', onState);
    try {
      initBranchBridge();
      const state = { path: '/org/site/page', status: 'ready', branch: 'feature' };
      canvasBus.branchState.emit(state);
      expect(events.at(-1)).to.equal(state);
      document.dispatchEvent(new CustomEvent('nx-branch-request', { detail: { path: state.path } }));
      expect(events.at(-1)).to.equal(state);
      expect(events.length).to.equal(2);
    } finally {
      document.removeEventListener('nx-branch-state', onState);
    }
  });
});
