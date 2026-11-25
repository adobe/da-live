import { expect } from '@esm-bundle/chai';
import { Y, yDocToProsemirror } from 'da-y-wrapper';
import { aem2doc, getSchema } from 'da-parser';
import { removeResolvedBases } from '../../../../../../blocks/edit/prose/diff/diff-bases.js';
import { handleDeleteSingleNode } from '../../../../../../blocks/edit/prose/diff/diff-actions.js';
import { getDiffClass } from '../../../../../../blocks/edit/prose/diff/diff-utils.js';
import { showGlobalDialog, hideGlobalDialog } from '../../../../../../blocks/edit/prose/diff/diff-global-dialog.js';
import { initDaMetadata } from '../../../../../../blocks/edit/utils/helpers.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

const PAGE = `<body><header></header><main><div>
<da-diff-base data-mdast="ignore" data-diff-group="g1"><p>Alpha base</p></da-diff-base>
<da-diff-deleted data-mdast="ignore" data-diff-group="g1" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed"><p>Alpha source</p></da-diff-deleted>
<p da-diff-added="" data-diff-group="g1" data-diff-side="local" data-diff-kind="changed">Alpha local</p>
<p>Middle</p>
<da-diff-base data-mdast="ignore" data-diff-group="g2"><p>Bravo base</p></da-diff-base>
<p da-diff-added="" data-diff-group="g2" data-diff-side="local" data-diff-kind="removed" data-diff-reason="both-changed">Bravo local</p>
<p>End</p>
</div></main><footer></footer></body>`;

const isLocNode = (node) => ['diff_added', 'diff_deleted'].includes(node?.type?.name);

async function openEditor() {
  const ydoc = new Y.Doc();
  aem2doc(PAGE, ydoc);
  initDaMetadata(ydoc.getMap('daMetadata'));
  const doc = yDocToProsemirror(getSchema(), ydoc);
  return createTestEditor({ doc, ydoc });
}

function find(doc, test) {
  const found = [];
  doc.descendants((node, pos) => {
    if (test(node)) {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
}

const bases = (view) => find(view.state.doc, (n) => n.type.name === 'diff_base')
  .map(({ node }) => node.attrs.diffGroup);
const markers = (view, group) => find(
  view.state.doc,
  (n) => isLocNode(n) && n.attrs.diffGroup === group,
);

describe('diff bases on resolve in /edit', () => {
  let editor;

  beforeEach(async () => {
    editor = await openEditor();
    window.view = editor.view;
  });

  afterEach(() => {
    hideGlobalDialog();
    destroyEditor(editor);
    delete window.view;
  });

  describe('removeResolvedBases', () => {
    it('removes the base of a group with no markers left', () => {
      const { view } = editor;
      const { tr } = view.state;
      markers(view, 'g2').forEach(({ node, pos }) => tr.delete(pos, pos + node.nodeSize));
      removeResolvedBases(tr, ['g2']);
      view.dispatch(tr);
      expect(bases(view)).to.deep.equal(['g1']);
    });

    it('keeps the base while a marker of the group remains', () => {
      const { view } = editor;
      const [first] = markers(view, 'g1');
      const tr = view.state.tr.delete(first.pos, first.pos + first.node.nodeSize);
      removeResolvedBases(tr, ['g1']);
      view.dispatch(tr);
      expect(bases(view)).to.deep.equal(['g1', 'g2']);
    });

    it('ignores groups it was not asked about', () => {
      const { view } = editor;
      const { tr } = view.state;
      markers(view, 'g2').forEach(({ node, pos }) => tr.delete(pos, pos + node.nodeSize));
      removeResolvedBases(tr, ['g1']);
      view.dispatch(tr);
      expect(bases(view)).to.deep.equal(['g1', 'g2']);
    });
  });

  it('removes the base when a single node is deleted', () => {
    const { view } = editor;
    const [{ pos }] = markers(view, 'g2');
    handleDeleteSingleNode(view, () => pos, () => true, isLocNode);
    expect(bases(view)).to.deep.equal(['g1']);
    expect(markers(view, 'g2')).to.have.length(0);
  });

  it('removes the base when a pair is resolved through the node view', () => {
    const { view } = editor;
    const [deleted, added] = markers(view, 'g1');
    const NodeView = getDiffClass('da-diff-deleted', getSchema, () => {}, { isUpstream: true });
    const instance = new NodeView(deleted.node, view, () => deleted.pos);
    instance.dispatchContentTransaction(deleted.pos, added.pos + added.node.nodeSize, [
      view.state.schema.nodes.paragraph.create(null, view.state.schema.text('Alpha local')),
    ]);
    expect(bases(view)).to.deep.equal(['g2']);
    expect(view.state.doc.textContent).to.include('Alpha local');
  });

  it('removes every base on Keep All', () => {
    const { view } = editor;
    const container = document.createElement('div');
    container.className = 'da-prose-mirror';
    view.dom.replaceWith(container);
    container.append(view.dom);
    showGlobalDialog(view, new Set([view]), () => [], isLocNode);
    container.querySelector('.da-diff-btn.is-local .confirm-btn').click();
    expect(bases(view)).to.deep.equal([]);
    expect(markers(view, 'g1')).to.have.length(0);
    expect(markers(view, 'g2')).to.have.length(0);
  });
});
