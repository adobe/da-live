import { expect } from '@esm-bundle/chai';
import { Y, yDocToProsemirror, yUndo } from 'da-y-wrapper';
import { aem2doc, getSchema } from 'da-parser';
import { hasGroupedMarkup } from '../../../../../blocks/canvas/editor-utils/diff-review.js';
import { applyResolution, loadDiffEngine } from '../../../../../blocks/edit/prose/diff/diff-engine.js';
import { initDaMetadata } from '../../../../../blocks/edit/utils/helpers.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

const waitFor = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const GROUPED = `<body><header></header><main><div>
<h1>Title</h1>
<da-diff-base data-mdast="ignore" data-diff-group="g1"><p>Alpha base</p></da-diff-base>
<da-diff-deleted data-mdast="ignore" data-diff-group="g1" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed"><p>Alpha source</p><p>Yankee source</p></da-diff-deleted>
<p da-diff-added="" data-diff-group="g1" data-diff-side="local" data-diff-kind="changed">Alpha local</p>
<ul><li>One</li><li><da-diff-deleted data-mdast="ignore" data-diff-group="g2" data-diff-side="source" data-diff-kind="changed" data-diff-reason="differs">Two source</da-diff-deleted></li><li><da-diff-added data-diff-group="g2" data-diff-side="local" data-diff-kind="changed">Two local</da-diff-added></li><li>Three</li></ul>
<da-diff-deleted data-mdast="ignore" data-diff-group="g3" data-diff-side="source" data-diff-kind="added" data-diff-reason="both-changed"><p>Charlie source</p></da-diff-deleted>
<da-diff-deleted data-mdast="ignore"><p>Legacy source</p></da-diff-deleted>
<p>Delta</p>
</div></main><footer></footer></body>`;

async function openEditor(html) {
  const ydoc = new Y.Doc();
  aem2doc(html, ydoc);
  const doc = yDocToProsemirror(getSchema(), ydoc);
  const editor = await createTestEditor({ doc, ydoc });
  initDaMetadata(ydoc.getMap('daMetadata'));
  await waitFor(10);
  return editor;
}

const hashOf = (engine, html) => engine.reviewHash(new DOMParser().parseFromString(html, 'text/html').body.firstElementChild);
const metadata = (editor) => editor.ydoc.getMap('daMetadata');
const stored = (editor, key) => (metadata(editor).get(key) || '').split(',').filter(Boolean);

describe('diff-review', () => {
  let editor;
  let engine;

  before(async () => {
    engine = await loadDiffEngine();
  });

  beforeEach(async () => {
    editor = await openEditor(GROUPED);
  });

  afterEach(() => {
    destroyEditor(editor);
    editor = undefined;
  });

  it('detects grouped markup', async () => {
    expect(hasGroupedMarkup(editor.view.state.doc)).to.equal(true);
    const plain = await openEditor('<body><main><div><da-diff-deleted data-mdast="ignore"><p>x</p></da-diff-deleted></div></main></body>');
    expect(hasGroupedMarkup(plain.view.state.doc)).to.equal(false);
    destroyEditor(plain);
  });

  it('summarizes groups through the parser adapter', () => {
    const summary = engine.reviewSummary(editor.view.state.doc);
    expect(summary.groups.map((g) => g.id)).to.deep.equal(['g1', 'g2', 'g3']);
    expect(summary.groups[0].preview.base).to.equal('Alpha base');
  });

  it('resolves a group with the da-merge bundle and records its hashes', () => {
    expect(applyResolution(editor.view, 'resolve', { groupId: 'g1', choice: engine.CHOICE.mine })).to.equal(true);
    const { doc } = editor.view.state;
    expect(engine.findGroup(doc, 'g1').markers).to.have.length(0);
    expect(engine.findGroup(doc, 'g1').bases).to.have.length(0);
    expect(doc.textContent).to.include('Alpha local');
    expect(doc.textContent).to.not.include('Alpha source');
    expect(engine.groups(doc).map(({ id }) => id)).to.deep.equal(['g2', 'g3']);
    expect(stored(editor, 'acceptedHashes')).to.deep.equal([hashOf(engine, '<p>Alpha local</p>')]);
    expect(stored(editor, 'rejectedHashes')).to.have.members([
      hashOf(engine, '<p>Alpha source</p>'),
      hashOf(engine, '<p>Yankee source</p>'),
    ]);
  });

  it('undoes the resolve and its recorded hashes in one step', () => {
    applyResolution(editor.view, 'resolve', { groupId: 'g1', choice: engine.CHOICE.source });
    expect(stored(editor, 'rejectedHashes')).to.have.length(1);
    expect(yUndo(editor.view.state)).to.equal(true);
    const { markers, bases } = engine.findGroup(editor.view.state.doc, 'g1');
    expect(markers).to.have.length(2);
    expect(bases).to.have.length(1);
    expect(metadata(editor).get('acceptedHashes')).to.equal(undefined);
    expect(metadata(editor).get('rejectedHashes')).to.equal(undefined);
  });
});
