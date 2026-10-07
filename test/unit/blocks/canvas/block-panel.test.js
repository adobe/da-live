import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';
import { PANEL_EVENT } from '../../../fixtures/nx/utils/panel.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../blocks/canvas/canvas.js');
});

describe('block selection opens the tool panel', () => {
  let opened;
  let onOpen;

  beforeEach(() => {
    opened = [];
    onOpen = (e) => opened.push(e.detail);
    document.addEventListener(PANEL_EVENT.OPEN, onOpen);
  });

  afterEach(() => document.removeEventListener(PANEL_EVENT.OPEN, onOpen));

  it('opens the Block tab for each whole-block selection in the document', () => {
    for (const blockName of ['hero', 'cards']) {
      canvasBus.editorSelectState.emit({ source: 'doc', selectionType: 'block', blockIndex: 0, blockName });
    }
    expect(opened).to.deep.equal([
      { section: 'tools', id: 'block', options: undefined },
      { section: 'tools', id: 'block', options: undefined },
    ]);
  });

  it('opens the Block tab for each whole-block selection in the iframe', () => {
    for (const name of ['hero', 'cards']) {
      canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: false, block: { name } });
    }
    expect(opened.map(({ id }) => id)).to.deep.equal(['block', 'block']);
  });

  it('opens for a cursor, text range or selected content inside a block', () => {
    for (const selectionType of ['empty', 'text', 'item']) {
      canvasBus.editorSelectState.emit({ source: 'doc', selectionType, blockIndex: 0 });
    }
    expect(opened.map(({ id }) => id)).to.deep.equal(['block', 'block', 'block']);
  });

  it('does not open outside blocks or for background document toolbar updates', () => {
    canvasBus.editorSelectState.emit({ source: 'doc', selectionType: 'text', blockIndex: -1 });
    canvasBus.editorSelectState.emit({ source: 'doc', selectionType: 'empty', blockIndex: -1 });
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: true });
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: false, block: { name: 'hero' } });
    expect(opened).to.deep.equal([]);
  });
});
