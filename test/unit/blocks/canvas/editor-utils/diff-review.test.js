import { expect } from '@esm-bundle/chai';
import { Y, yDocToProsemirror } from 'da-y-wrapper';
import { aem2doc, getSchema } from 'da-parser';
import {
  CHOICE,
  docToPageHtml,
  findGroup,
  getReviewSummary,
  hasGroupedMarkup,
  resolveAll,
  resolveGroup,
} from '../../../../../blocks/canvas/editor-utils/diff-review.js';
import { getDaMetadata, initDaMetadata } from '../../../../../blocks/edit/utils/helpers.js';
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
  return editor;
}

function mainOf(view) {
  const dom = new DOMParser().parseFromString(docToPageHtml(view.state.doc), 'text/html');
  return dom.querySelector('main');
}

const texts = (main, selector) => [...main.querySelectorAll(selector)]
  .map((el) => el.textContent.trim());

describe('diff-review', () => {
  let editor;

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

  it('summarizes groups through da-merge diffSummary', () => {
    const summary = getReviewSummary(editor.view.state.doc);
    expect(summary.groups.map((g) => g.id)).to.deep.equal(['g1', 'g2', 'g3']);
    const [g1, g2, g3] = summary.groups;
    expect(g1).to.include({ reason: 'both-changed', section: 0 });
    expect(g1.sides).to.deep.equal(['source', 'local']);
    expect(g1.preview.base).to.equal('Alpha base');
    expect(g2.sides).to.deep.equal(['source', 'local']);
    expect(g2.preview).to.deep.equal({ source: 'Two source', local: 'Two local' });
    expect(g3.kinds).to.deep.equal(['added']);
    expect(g3.sides).to.deep.equal(['source']);
    expect(summary.legacy).to.equal(false);
  });

  it('keep mine drops the source side, unwraps the local side, and removes the base', async () => {
    resolveGroup(editor.view, 'g1', CHOICE.mine);
    const main = mainOf(editor.view);
    expect(main.querySelector('[data-diff-group="g1"]')).to.equal(null);
    expect(main.querySelector('da-diff-base')).to.equal(null);
    expect(main.textContent).to.not.include('Alpha source');
    expect(main.textContent).to.not.include('Yankee source');
    const alpha = [...main.querySelectorAll('p')].find((p) => p.textContent === 'Alpha local');
    expect(alpha.hasAttribute('da-diff-added')).to.equal(false);
    expect(main.querySelectorAll('[data-diff-group="g2"]').length).to.equal(2);
    await waitFor(100);
    expect(getDaMetadata('rejectedHashes')).to.be.a('string').and.not.equal('');
  });

  it('records one rejected hash per source unit', async () => {
    resolveGroup(editor.view, 'g1', CHOICE.mine);
    await waitFor(100);
    expect(getDaMetadata('rejectedHashes').split(',')).to.have.length(2);
  });

  it('take source keeps the source side and drops the local side', () => {
    resolveGroup(editor.view, 'g1', CHOICE.source);
    const main = mainOf(editor.view);
    const paras = texts(main, ':scope > div > p');
    expect(paras.slice(0, 2)).to.deep.equal(['Alpha source', 'Yankee source']);
    expect(main.textContent).to.not.include('Alpha local');
    expect(main.querySelector('da-diff-base')).to.equal(null);
  });

  it('keep both keeps both sides in place', () => {
    resolveGroup(editor.view, 'g1', CHOICE.both);
    const main = mainOf(editor.view);
    expect(texts(main, ':scope > div > p').slice(0, 3)).to.deep.equal(['Alpha source', 'Yankee source', 'Alpha local']);
    expect(main.querySelector('[data-diff-group="g1"]')).to.equal(null);
  });

  it('resolves a list group item by item', () => {
    resolveGroup(editor.view, 'g2', CHOICE.mine);
    const main = mainOf(editor.view);
    expect(texts(main, 'li')).to.deep.equal(['One', 'Two local', 'Three']);
    expect(main.querySelector('li[da-diff-added]')).to.equal(null);
  });

  it('take source on a one-sided both-changed group keeps the source unit', () => {
    resolveGroup(editor.view, 'g3', CHOICE.source);
    const main = mainOf(editor.view);
    expect(texts(main, ':scope > div > p')).to.include('Charlie source');
    expect(findGroup(editor.view.state.doc, 'g3').markers).to.have.length(0);
  });

  it('leaves ungrouped markup alone when resolving a group', () => {
    resolveGroup(editor.view, 'g1', CHOICE.mine);
    const main = mainOf(editor.view);
    expect(main.querySelector('da-diff-deleted:not([data-diff-group])').textContent).to.equal('Legacy source');
  });

  it('accept all mine resolves every group and ungrouped marker', () => {
    resolveAll(editor.view, CHOICE.mine);
    const main = mainOf(editor.view);
    expect(main.querySelector('da-diff-deleted, da-diff-added, [da-diff-added], da-diff-base')).to.equal(null);
    expect(texts(main, ':scope > div > p')).to.deep.equal(['Alpha local', 'Delta']);
    expect(texts(main, 'li')).to.deep.equal(['One', 'Two local', 'Three']);
  });

  it('accept all source resolves every group and ungrouped marker', () => {
    resolveAll(editor.view, CHOICE.source);
    const main = mainOf(editor.view);
    expect(main.querySelector('da-diff-deleted, da-diff-added, [da-diff-added], da-diff-base')).to.equal(null);
    expect(texts(main, ':scope > div > p')).to.deep.equal(['Alpha source', 'Yankee source', 'Charlie source', 'Legacy source', 'Delta']);
    expect(texts(main, 'li')).to.deep.equal(['One', 'Two source', 'Three']);
  });
});
