import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { readOnly } = await import('../../../../../blocks/canvas/ew-editor-doc/prose.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('readOnly prose plugin', () => {
  let reader;
  let writer;

  beforeEach(async () => {
    reader = await createTestEditor({ editable: false, additionalPlugins: [readOnly()] });
    writer = await createTestEditor();
  });

  afterEach(() => {
    destroyEditor(reader);
    destroyEditor(writer);
  });

  it('drops local document changes even when dispatched programmatically', () => {
    const { view } = reader;
    const before = view.state.doc;
    view.dispatch(view.state.tr.insertText('phantom', 1));
    expect(view.state.doc.eq(before)).to.be.true;
    expect(reader.yXmlFragment.length).to.equal(0);
  });

  it('lets non-document transactions through', () => {
    const { view } = reader;
    view.dispatch(view.state.tr.setStoredMarks([view.state.schema.marks.strong.create()]));
    expect(view.state.storedMarks).to.have.length(1);
  });

  it('applies collaborators\' changes arriving through Yjs', async () => {
    writer.view.dispatch(writer.view.state.tr.insertText('remote', 1));
    Y.applyUpdate(reader.ydoc, Y.encodeStateAsUpdate(writer.ydoc));
    await nextFrame();
    expect(reader.view.state.doc.textContent).to.equal('remote');
  });
});
