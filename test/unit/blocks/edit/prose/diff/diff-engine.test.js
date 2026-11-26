import { expect } from '@esm-bundle/chai';
import { Y, yDocToProsemirror, yUndo } from 'da-y-wrapper';
import { aem2doc, getSchema } from 'da-parser';
import { initDaMetadata } from '../../../../../../blocks/edit/utils/helpers.js';
import { getDiffClass } from '../../../../../../blocks/edit/prose/diff/diff-utils.js';
import { showGlobalDialog, hideGlobalDialog } from '../../../../../../blocks/edit/prose/diff/diff-global-dialog.js';
import { loadDiffEngine } from '../../../../../../blocks/edit/prose/diff/diff-engine.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

const waitFor = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const PAGE = `<body><header></header><main><div>
<da-diff-deleted><h2>Hello</h2></da-diff-deleted><h2 da-diff-added="">Welcome</h2>
<p>Middle</p>
<da-diff-deleted><p>One</p><p>Two</p></da-diff-deleted>
<ul><li>Keep</li><li><da-diff-deleted>Gone</da-diff-deleted></li></ul>
</div></main><footer></footer></body>`;

const isLocNode = (node) => ['diff_deleted', 'diff_added'].includes(node?.type?.name);

function markers(view) {
  const found = [];
  view.state.doc.descendants((node, pos) => {
    if (isLocNode(node)) {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
}

const hashOf = (engine, html) => engine.reviewHash(new DOMParser().parseFromString(html, 'text/html').body.firstElementChild);

describe('classic editor resolve with the da-merge bundle', () => {
  let editor;
  let engine;
  let container;

  const metadata = () => editor.ydoc.getMap('daMetadata');
  const stored = (key) => (metadata().get(key) || '').split(',').filter(Boolean);

  function nodeView(entry) {
    const name = entry.node.type.name === 'diff_deleted' ? 'da-diff-deleted' : 'da-diff-added';
    const NodeView = getDiffClass(name, getSchema, () => {}, { isUpstream: name === 'da-diff-deleted' });
    return new NodeView(entry.node, editor.view, () => entry.pos);
  }

  before(async () => {
    engine = await loadDiffEngine();
  });

  beforeEach(async () => {
    const ydoc = new Y.Doc();
    aem2doc(PAGE, ydoc);
    editor = await createTestEditor({ doc: yDocToProsemirror(getSchema(), ydoc), ydoc });
    container = document.createElement('div');
    container.className = 'da-prose-mirror';
    editor.view.dom.replaceWith(container);
    container.append(editor.view.dom);
    initDaMetadata(ydoc.getMap('daMetadata'));
    await waitFor(10);
  });

  afterEach(() => {
    hideGlobalDialog();
    container.remove();
    destroyEditor(editor);
  });

  it('keeps the local side of a pair and records both hashes', async () => {
    await nodeView(markers(editor.view)[0]).handleKeepAdded();
    const { textContent } = editor.view.state.doc;
    expect(textContent).to.include('Welcome');
    expect(textContent).to.not.include('Hello');
    expect(markers(editor.view)).to.have.length(2);
    expect(stored('acceptedHashes')).to.deep.equal([hashOf(engine, '<h2>Welcome</h2>')]);
    expect(stored('rejectedHashes')).to.deep.equal([hashOf(engine, '<h2>Hello</h2>')]);
  });

  it('drops a single marker with every unit hashed and its list item removed', async () => {
    const [, , multi, item] = markers(editor.view);
    await nodeView(item).handleDeleteSingleNode();
    await nodeView(multi).handleDeleteSingleNode();
    const { doc } = editor.view.state;
    expect(doc.textContent).to.not.include('Gone');
    expect(doc.textContent).to.not.include('One');
    expect(doc.textContent).to.include('Keep');
    expect(stored('rejectedHashes')).to.have.members([
      hashOf(engine, '<li>Gone</li>'),
      hashOf(engine, '<p>One</p>'),
      hashOf(engine, '<p>Two</p>'),
    ]);
  });

  it('keeps all upstream from the global dialog', async () => {
    showGlobalDialog(editor.view, new Set([editor.view]));
    container.querySelector('.da-diff-btn.is-upstream .confirm-btn').click();
    await waitFor(10);
    expect(markers(editor.view)).to.have.length(0);
    expect(editor.view.state.doc.textContent).to.include('Hello');
    expect(stored('rejectedHashes')).to.deep.equal([hashOf(engine, '<h2>Welcome</h2>')]);
    expect(container.querySelector('.da-regional-edits-overlay')).to.equal(null);
  });

  it('undoes a resolve and its recorded hashes in one step', async () => {
    await nodeView(markers(editor.view)[0]).handleKeepBoth();
    expect(stored('acceptedHashes')).to.have.length(2);
    expect(yUndo(editor.view.state)).to.equal(true);
    expect(markers(editor.view)).to.have.length(4);
    expect(metadata().get('acceptedHashes')).to.equal(undefined);
    expect(metadata().get('rejectedHashes')).to.equal(undefined);
  });
});
