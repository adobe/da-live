import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getCommentsBridge;
let setCommentsController;
let formatCommentsViewLabel;
let toggleComments;
let getCommentsVisible;

before(async () => {
  ({
    getCommentsBridge,
    setCommentsController,
    formatCommentsViewLabel,
    toggleComments,
    getCommentsVisible,
  } = await import('../../../../../blocks/canvas/editor-utils/comments-bridge.js'));
});

function stubController(initial = {}) {
  const state = { panelOpen: false, ...initial };
  return {
    closedCount: 0,
    get panelOpen() { return state.panelOpen; },
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

  it('getCommentsVisible is true when the panel is open', () => {
    setCommentsController(stubController());
    expect(getCommentsVisible()).to.be.false;

    const withPanel = stubController({ panelOpen: true });
    setCommentsController(withPanel);
    expect(getCommentsVisible()).to.be.true;
  });

  it('toggleComments opens the comments panel when nothing is visible', async () => {
    const controller = stubController();
    setCommentsController(controller);

    // PANEL_EVENT.OPEN on document → nx panel.js opens the tools/comments view.
    const opened = await new Promise((resolve) => {
      document.addEventListener('nx-panel-open', (e) => resolve(e.detail), { once: true });
      toggleComments();
    });

    expect(opened).to.deep.equal({ section: 'tools', id: 'comments' });
    expect(controller.closedCount).to.equal(0);
  });

  it('toggleComments closes the panel when it is open', () => {
    const controller = stubController({ panelOpen: true });
    setCommentsController(controller);
    toggleComments();
    expect(controller.panelOpen).to.be.false;
    expect(controller.closedCount).to.equal(1);
  });

  it('toggleComments closes the host rail (nx-panel-close) when the panel is open', async () => {
    const aside = document.createElement('aside');
    aside.className = 'panel';
    aside.dataset.position = 'after';
    document.body.appendChild(aside);

    const controller = stubController({ panelOpen: true });
    setCommentsController(controller);

    await new Promise((resolve) => {
      aside.addEventListener('nx-panel-close', resolve, { once: true });
      toggleComments();
    });

    aside.remove();
  });

  it('toggleComments is a no-op without a controller', () => {
    setCommentsController(null);
    expect(() => toggleComments()).to.not.throw();
    expect(getCommentsVisible()).to.be.false;
  });

  it('emits the controller on canvasBus.commentsControllerState', async () => {
    const controller = { id: 'c2' };
    const received = await new Promise((resolve) => {
      const off = canvasBus.commentsControllerState.subscribe((c) => {
        off();
        resolve(c);
      });
      setCommentsController(controller);
    });
    expect(received).to.equal(controller);
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
