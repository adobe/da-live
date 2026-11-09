import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { toolbarController } from '../../../../../blocks/canvas/editor-utils/toolbar-controller.js';

describe('toolbar controller while the preview is read-only', () => {
  let frame;
  let tb;
  let btb;

  beforeEach(() => {
    frame = sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => {
      cb();
      return 0;
    });
    toolbarController.reset();
    canvasBus.blockEditState.emit({ open: false });
    canvasBus.editorViewState.emit({ view: 'layout' });
    tb = toolbarController.ensureToolbar();
    btb = toolbarController.ensureBlockToolbar();
    tb.show = sinon.spy();
    tb.hide = sinon.spy();
    tb.cancelInteraction = sinon.spy();
    btb.show = sinon.spy();
    btb.hide = sinon.spy();
    btb.cancelInteraction = sinon.spy();
  });

  afterEach(() => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: false });
    toolbarController.reset();
    frame.restore();
    ['show', 'hide', 'cancelInteraction'].forEach((key) => {
      delete tb[key];
      delete btb[key];
    });
  });

  it('withholds the block toolbar for a layout block selection while conflicts exist', () => {
    const block = { name: 'hero', variant: '' };
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true, block });
    expect(btb.show.called).to.be.false;

    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: false });
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true, block });
    expect(btb.show.calledWith('hero', '')).to.be.true;
  });

  it('offers the comment toolbar for a layout block selection while conflicts exist', () => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: false, block: { name: 'hero', variant: '' } });
    expect(tb.show.called).to.be.true;
    expect(btb.show.called).to.be.false;
  });

  it('cancels pending toolbar interactions when the layout surface locks', () => {
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true });
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    expect(tb.cancelInteraction.calledOnce).to.be.true;
    expect(btb.cancelInteraction.calledOnce).to.be.true;
    expect(btb.readOnly).to.be.true;
  });

  it('leaves doc-surface interactions alone when the layout locks', () => {
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'doc', active: true });
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    expect(tb.cancelInteraction.called).to.be.false;
    expect(btb.cancelInteraction.called).to.be.false;
    expect(btb.readOnly).to.be.false;
  });

  it('marks the selection toolbar read-only while conflicts exist', () => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    expect(tb.readOnly).to.be.true;
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: false });
    expect(tb.readOnly).to.be.false;
  });
});
