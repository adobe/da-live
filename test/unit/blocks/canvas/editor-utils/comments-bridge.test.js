import { expect } from '@esm-bundle/chai';
import {
  getCommentsBridge,
  setCommentsController,
  formatCommentsViewLabel,
  toggleComments,
  getCommentsVisible,
} from '../../../../../blocks/canvas/editor-utils/comments-bridge.js';

function stubController(initial = {}) {
  const state = { showHighlights: false, panelOpen: false, ...initial };
  return {
    closedCount: 0,
    get showHighlights() { return state.showHighlights; },
    get panelOpen() { return state.panelOpen; },
    setShowHighlights(next) { state.showHighlights = next; },
    closePanel() { state.panelOpen = false; this.closedCount += 1; },
  };
}

describe('comments-bridge', () => {
  afterEach(() => setCommentsController(null));

  it('stores the controller on the singleton', () => {
    const controller = { id: 'c1' };
    setCommentsController(controller);
    expect(getCommentsBridge().controller).to.equal(controller);
  });

  it('getCommentsVisible is true when the panel is open OR highlights are on', () => {
    setCommentsController(stubController());
    expect(getCommentsVisible()).to.be.false;

    const withHighlights = stubController({ showHighlights: true });
    setCommentsController(withHighlights);
    expect(getCommentsVisible()).to.be.true;

    const withPanel = stubController({ panelOpen: true });
    setCommentsController(withPanel);
    expect(getCommentsVisible()).to.be.true;
  });

  it('toggleComments opens the comments panel when nothing is visible', () => {
    const header = document.createElement('ew-canvas-header');
    document.body.appendChild(header);
    let opened = null;
    header.addEventListener('nx-canvas-open-panel', (e) => { opened = e.detail; });

    const controller = stubController();
    setCommentsController(controller);
    toggleComments();

    expect(opened).to.deep.equal({ position: 'after', panelName: 'comments' });
    expect(controller.showHighlights).to.be.false;
    expect(controller.closedCount).to.equal(0);
    header.remove();
  });

  it('toggleComments hides everything (closes panel + clears highlights) when visible', () => {
    const controller = stubController({ panelOpen: true, showHighlights: true });
    setCommentsController(controller);
    toggleComments();
    expect(controller.panelOpen).to.be.false;
    expect(controller.showHighlights).to.be.false;
    expect(controller.closedCount).to.equal(1);
  });

  it('toggleComments closes the host rail (nx-panel-close) when the panel is open', () => {
    const aside = document.createElement('aside');
    aside.className = 'panel';
    aside.dataset.position = 'after';
    document.body.appendChild(aside);
    let closed = 0;
    aside.addEventListener('nx-panel-close', () => { closed += 1; });

    const controller = stubController({ panelOpen: true, showHighlights: true });
    setCommentsController(controller);
    toggleComments();

    expect(closed).to.equal(1);
    aside.remove();
  });

  it('toggleComments closes the panel even when highlights were already off', () => {
    const controller = stubController({ panelOpen: true, showHighlights: false });
    setCommentsController(controller);
    toggleComments();
    expect(controller.panelOpen).to.be.false;
    expect(controller.showHighlights).to.be.false;
  });

  it('toggleComments is a no-op without a controller', () => {
    setCommentsController(null);
    expect(() => toggleComments()).to.not.throw();
    expect(getCommentsVisible()).to.be.false;
  });

  it('dispatches nx-comments-controller-change on document', async () => {
    const controller = { id: 'c2' };
    const event = await new Promise((resolve) => {
      document.addEventListener('nx-comments-controller-change', resolve, { once: true });
      setCommentsController(controller);
    });
    expect(event.detail.controller).to.equal(controller);
  });
});

describe('formatCommentsViewLabel', () => {
  it('includes the count when active threads exist', () => {
    expect(formatCommentsViewLabel(20)).to.equal('Comments (20)');
  });

  it('returns plain Comments when the count is zero', () => {
    expect(formatCommentsViewLabel(0)).to.equal('Comments');
    expect(formatCommentsViewLabel()).to.equal('Comments');
  });
});
