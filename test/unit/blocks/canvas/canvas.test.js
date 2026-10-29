import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { PANEL_EVENT } = await import('../../../fixtures/nx/utils/panel.js');
await import('../../../../blocks/canvas/canvas.js');
const { toolbarController } = await import('../../../../blocks/canvas/editor-utils/toolbar-controller.js');

describe('canvas block selection', () => {
  let opened;
  let onOpen;

  beforeEach(() => {
    opened = [];
    onOpen = ({ detail }) => opened.push(detail);
    document.addEventListener(PANEL_EVENT.OPEN, onOpen);
  });

  afterEach(() => {
    document.removeEventListener(PANEL_EVENT.OPEN, onOpen);
    toolbarController.reset();
  });

  it('does not open or switch the sidebar when a preview block is selected', () => {
    canvasBus.toolbarSelectionState.emit({
      surface: 'wysiwyg',
      showable: true,
      block: { name: 'cards', variant: '' },
    });
    expect(opened).to.have.lengthOf(0);
  });

  it('does not open or switch the sidebar when a document block is selected', () => {
    canvasBus.editorSelectState.emit({ source: 'doc', blockIndex: 0 });
    expect(opened).to.have.lengthOf(0);
  });
});
