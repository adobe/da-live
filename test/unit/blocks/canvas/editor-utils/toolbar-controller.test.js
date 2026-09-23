import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { toolbarController } from '../../../../../blocks/canvas/editor-utils/toolbar-controller.js';

describe('toolbar controller bus subscriptions', () => {
  let frame;

  beforeEach(() => {
    frame = sinon.stub(window, 'requestAnimationFrame');
    toolbarController.reset();
    canvasBus.blockEditState.emit({ open: false });
    canvasBus.editorViewState.emit({ view: 'content' });
  });

  afterEach(() => {
    toolbarController.reset();
    frame.restore();
  });

  it('tracks the active surface through the bus and protects doc focus while the iframe owns it', () => {
    const focus = sinon.spy();
    const view = { dom: document.createElement('div'), focus };
    toolbarController.setDocView(view);
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'doc', active: true });
    view.focus();
    expect(focus.callCount).to.equal(1);

    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true });
    expect(toolbarController.activeSurface).to.equal('wysiwyg');
    view.focus();
    expect(focus.callCount).to.equal(1);

    canvasBus.toolbarSurfaceRequest.emit({ surface: 'wysiwyg', active: false });
    expect(toolbarController.activeSurface).to.equal(null);
    view.focus();
    expect(focus.callCount).to.equal(2);
  });

  it('lets block edit claim doc focus and prevents iframe selections from taking it back', () => {
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'wysiwyg', active: true });
    canvasBus.blockEditState.emit({ open: true });
    expect(toolbarController.activeSurface).to.equal('doc');
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true });
    expect(toolbarController.activeSurface).to.equal('doc');

    canvasBus.blockEditState.emit({ open: false });
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true });
    expect(toolbarController.activeSurface).to.equal('wysiwyg');
  });

  it('ignores a late blur from a surface that no longer owns editing', () => {
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'doc', active: true });
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'wysiwyg', active: true });
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'doc', active: false });
    expect(toolbarController.activeSurface).to.equal('wysiwyg');
  });

  it('does not claim doc focus for a background doc selection', () => {
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'wysiwyg', active: true });
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    expect(toolbarController.activeSurface).to.equal('wysiwyg');
  });

  it('clears replayed block-edit state when the doc controller resets', () => {
    canvasBus.blockEditState.emit({ open: true });
    toolbarController.reset();
    let current;
    const unsub = canvasBus.blockEditState.subscribe((value) => { current = value; });
    unsub();
    expect(current).to.deep.equal({ open: false });
    expect(toolbarController.activeSurface).to.equal(null);
  });
});
