import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');
const { toolbarController } = await import('../../../../../blocks/canvas/editor-utils/toolbar-controller.js');

describe('toolbar controller — section toolbar', () => {
  let frame;
  let sectionTb;
  let blockTb;

  before(async () => {
    await Promise.all([
      import('../../../../../blocks/canvas/ew-selection-toolbar/ew-selection-toolbar.js'),
      import('../../../../../blocks/canvas/ew-block-toolbar/ew-block-toolbar.js'),
      import('../../../../../blocks/canvas/ew-section-toolbar/ew-section-toolbar.js'),
    ]);
  });

  beforeEach(() => {
    frame = sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => cb());
    toolbarController.reset();
    canvasBus.blockEditState.emit({ open: false });
    canvasBus.editorViewState.emit({ view: 'layout' });
    sectionTb = toolbarController.ensureSectionToolbar();
    blockTb = toolbarController.ensureBlockToolbar();
    sinon.stub(blockTb, 'show').callsFake(() => blockTb.classList.add('open'));
  });

  afterEach(() => {
    toolbarController.reset();
    blockTb.show.restore();
    frame.restore();
  });

  const selectSection = (sectionIndex) => canvasBus.editorSectionSelectState
    .emit({ sectionIndex, source: 'layout' });

  it('shows the section toolbar for a selected section and hides it on clear', () => {
    selectSection(2);
    expect(sectionTb.open).to.equal(true);
    expect(sectionTb.sectionIndex).to.equal(2);

    selectSection(null);
    expect(sectionTb.open).to.equal(false);
  });

  it('takes over from the block toolbar and does not bring the old block back on clear', () => {
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: false, block: { name: 'cards', variant: '' } });
    expect(blockTb.open).to.equal(true);

    selectSection(1);
    expect(blockTb.open).to.equal(false);

    selectSection(null);
    expect(blockTb.open).to.equal(false);
  });

  it('clears on an iframe selection but not on iframe focus alone', () => {
    selectSection(0);
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true, focusOnly: true });
    expect(sectionTb.open).to.equal(true);

    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true });
    expect(sectionTb.open).to.equal(false);
  });

  it('survives background doc selections and clears when the doc editor takes focus', () => {
    selectSection(0);
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    canvasBus.editorSelectState.emit({ blockIndex: 0, source: 'doc' });
    expect(sectionTb.open).to.equal(true);

    canvasBus.toolbarSurfaceRequest.emit({ surface: 'doc', active: true });
    expect(sectionTb.open).to.equal(false);
  });

  it('clears on an outline block or content selection', () => {
    selectSection(0);
    canvasBus.editorSelectState.emit({ blockIndex: 1, source: 'outline' });
    expect(sectionTb.open).to.equal(false);

    selectSection(0);
    canvasBus.editorProseSelectState.emit({ proseIndex: 3, kind: 'paragraph' });
    expect(sectionTb.open).to.equal(false);
  });

  it('hides while the block edit modal is open', () => {
    selectSection(0);
    canvasBus.blockEditState.emit({ open: true });
    expect(sectionTb.open).to.equal(false);
  });
});
