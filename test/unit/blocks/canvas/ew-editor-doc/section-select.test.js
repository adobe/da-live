import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { handleNodeSelect } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/utils/handlers.js');
const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');

describe('handleNodeSelect — section branch', () => {
  let editor;
  let unsub;
  let received;

  beforeEach(async () => {
    editor = await createTestEditor();
    received = [];
    unsub = canvasBus.editorSectionSelectState.subscribe((detail) => received.push(detail));
  });

  afterEach(() => {
    unsub();
    destroyEditor(editor);
  });

  it('emits editorSectionSelectState for a section payload without touching the PM selection', () => {
    const ctx = { view: editor.view };
    const before = editor.view.state.selection;
    expect(before instanceof TextSelection).to.equal(true);

    handleNodeSelect({ node: { anchorType: 'section', sectionIndex: 2 } }, ctx);

    expect(received).to.deep.equal([{ sectionIndex: 2, source: 'layout' }]);
    const after = editor.view.state.selection;
    expect(after instanceof TextSelection).to.equal(true);
    expect(after.eq(before)).to.equal(true);
  });

  it('emits a clearing event for a null payload', () => {
    const ctx = { view: editor.view };

    handleNodeSelect({ node: null }, ctx);

    expect(received).to.deep.equal([{ sectionIndex: null, source: 'layout' }]);
  });
});
