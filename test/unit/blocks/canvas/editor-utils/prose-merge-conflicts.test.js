import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { Y, yDocToProsemirror } from 'da-y-wrapper';
import { aem2doc, getSchema } from 'da-parser';
import { createMergeConflictsPlugin } from '../../../../../blocks/canvas/editor-utils/prose-merge-conflicts.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { loadDiffEngine } from '../../../../../blocks/edit/prose/diff/diff-engine.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

const GROUPED = `<body><main><div>
<da-diff-deleted data-mdast="ignore" data-diff-group="g1" data-diff-side="source" data-diff-kind="changed"><p>Alpha source</p></da-diff-deleted>
<p da-diff-added="" data-diff-group="g1" data-diff-side="local" data-diff-kind="changed">Alpha local</p>
</div></main></body>`;

async function openGrouped(plugin) {
  const ydoc = new Y.Doc();
  aem2doc(GROUPED, ydoc);
  const doc = yDocToProsemirror(getSchema(), ydoc);
  return createTestEditor({ doc, ydoc, additionalPlugins: [plugin] });
}

const waitFor = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('createMergeConflictsPlugin', () => {
  let editor;

  afterEach(() => {
    if (editor) destroyEditor(editor);
    editor = undefined;
  });

  it('reports false shortly after mount when the doc has no merge-conflict nodes', async () => {
    const calls = [];
    const plugin = createMergeConflictsPlugin((hasMergeConflicts) => calls.push(hasMergeConflicts));
    editor = await createTestEditor({ additionalPlugins: [plugin] });

    await waitFor(600);

    expect(calls).to.deep.equal([false]);
  });

  it('reports true once a diff_added node is inserted', async () => {
    const calls = [];
    const plugin = createMergeConflictsPlugin((hasMergeConflicts) => calls.push(hasMergeConflicts));
    editor = await createTestEditor({ additionalPlugins: [plugin] });

    const { schema } = editor.view.state;
    const para = schema.nodes.paragraph.create(null, schema.text('new'));
    const diffAdded = schema.nodes.diff_added.create({}, para);
    const tr = editor.view.state.tr.insert(editor.view.state.doc.content.size, diffAdded);
    editor.view.dispatch(tr);

    await waitFor(600);

    expect(calls[calls.length - 1]).to.equal(true);
  });

  it('does not re-check on transactions that leave the doc unchanged', async () => {
    const calls = [];
    const plugin = createMergeConflictsPlugin((hasMergeConflicts) => calls.push(hasMergeConflicts));
    editor = await createTestEditor({ additionalPlugins: [plugin] });

    await waitFor(600); // let the initial mount check land
    calls.length = 0;

    editor.view.dispatch(editor.view.state.tr); // no doc change
    await waitFor(600);

    expect(calls).to.deep.equal([]);
  });

  it('does not report after the editor is destroyed', async () => {
    const calls = [];
    const plugin = createMergeConflictsPlugin((hasMergeConflicts) => calls.push(hasMergeConflicts));
    editor = await createTestEditor({ additionalPlugins: [plugin] });

    // The mount check is still pending when the page goes away.
    destroyEditor(editor);
    editor = undefined;
    await waitFor(600);

    expect(calls).to.deep.equal([]);
  });

  describe('with grouped markup', () => {
    let engine;
    let states;
    let unsubscribe;

    beforeEach(async () => {
      engine = await loadDiffEngine();
      states = [];
      unsubscribe = canvasBus.diffReviewState.subscribe((detail) => states.push(detail));
    });

    afterEach(() => {
      unsubscribe();
      sinon.restore();
    });

    const bar = () => editor.view.dom.parentNode?.querySelector('.diff-review-bar');

    it('shows the review bar and clears the review state when the view goes', async () => {
      editor = await openGrouped(createMergeConflictsPlugin(() => {}));
      await waitFor(600);
      expect(bar()).to.not.equal(null);
      expect(states.at(-1).summary.groups).to.have.length(1);
      destroyEditor(editor);
      editor = undefined;
      expect(states.at(-1)).to.equal(null);
    });

    it('falls back to the legacy check when the summary fails', async () => {
      sinon.stub(engine, 'reviewSummary').throws(new Error('broken'));
      sinon.stub(console, 'warn');
      const calls = [];
      editor = await openGrouped(createMergeConflictsPlugin((value) => calls.push(value)));
      await waitFor(600);
      expect(calls).to.deep.equal([true]);
      expect(bar()).to.equal(null);
      expect(states.filter(Boolean)).to.deep.equal([]);
    });
  });
});
