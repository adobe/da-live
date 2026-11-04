import { expect } from '@esm-bundle/chai';
import { EditorState, Y, ySyncPlugin, yUndoPlugin } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { undoRedoKeys } = await import('../../../../../blocks/canvas/ew-editor-doc/prose.js');

describe('canvas undo/redo keys', () => {
  it('consumes undo and redo when there is nothing to undo or redo', () => {
    const ydoc = new Y.Doc();
    const state = EditorState.create({
      schema: getSchema(),
      plugins: [ySyncPlugin(ydoc.getXmlFragment('prosemirror')), yUndoPlugin()],
    });
    Object.values(undoRedoKeys).forEach((run) => expect(run(state)).to.equal(true));
    ydoc.destroy();
  });
});
