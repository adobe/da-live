import { expect } from '@esm-bundle/chai';
import { createMergeConflictsPlugin } from '../../../../../blocks/canvas/editor-utils/prose-merge-conflicts.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

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
});
