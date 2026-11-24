import { expect } from '@esm-bundle/chai';
import { Y, yDocToProsemirror } from 'da-y-wrapper';
import { aem2doc, getSchema } from 'da-parser';
import {
  createReviewNodeViews,
  groupTitle,
  reasonText,
} from '../../../../../blocks/canvas/editor-utils/diff-review-view.js';
import { createMergeConflictsPlugin } from '../../../../../blocks/canvas/editor-utils/prose-merge-conflicts.js';
import { initDaMetadata } from '../../../../../blocks/edit/utils/helpers.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

const waitFor = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const PAGE = `<body><header></header><main><div>
<da-diff-base data-mdast="ignore" data-diff-group="g1"><p>Alpha base</p></da-diff-base>
<da-diff-deleted data-mdast="ignore" data-diff-group="g1" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed"><p>Alpha source</p><p>Yankee source</p></da-diff-deleted>
<p da-diff-added="" data-diff-group="g1" data-diff-side="local" data-diff-kind="changed">Alpha local</p>
<ul><li><da-diff-deleted data-mdast="ignore" data-diff-group="g2" data-diff-side="source" data-diff-kind="changed" data-diff-reason="differs">Two source</da-diff-deleted></li><li><da-diff-added data-diff-group="g2" data-diff-side="local" data-diff-kind="changed">Two local</da-diff-added></li></ul>
<p da-diff-added="" data-diff-group="g3" data-diff-side="local" data-diff-kind="added" data-diff-reason="both-changed">Charlie local</p>
<da-diff-deleted data-mdast="ignore"><p>Legacy source</p></da-diff-deleted>
<p>Delta</p>
</div></main><footer></footer></body>`;

const fallback = {
  diff_added: () => ({ dom: Object.assign(document.createElement('span'), { className: 'legacy-added' }) }),
  diff_deleted: () => ({ dom: Object.assign(document.createElement('span'), { className: 'legacy-deleted' }) }),
};

async function openEditor(html, { withPlugin = false } = {}) {
  const ydoc = new Y.Doc();
  aem2doc(html, ydoc);
  const doc = yDocToProsemirror(getSchema(), ydoc);
  const additionalPlugins = withPlugin ? [createMergeConflictsPlugin(() => {})] : [];
  const editor = await createTestEditor({ doc, ydoc, additionalPlugins });
  initDaMetadata(ydoc.getMap('daMetadata'));
  editor.view.setProps({ nodeViews: createReviewNodeViews(fallback) });
  return editor;
}

const cards = (view) => [...view.dom.querySelectorAll('.diff-group-card')];
const card = (view, id) => view.dom.querySelector(`.diff-group-card[data-diff-group="${id}"]`);
const buttons = (el) => [...el.querySelectorAll('.diff-group-action')].map((b) => b.textContent);

describe('diff-review-view', () => {
  let editor;

  afterEach(() => {
    destroyEditor(editor);
    editor = undefined;
  });

  describe('text', () => {
    it('names which side changed what', () => {
      expect(groupTitle({ sides: ['source', 'local'], kinds: ['changed'] })).to.equal('Source changed this · You changed this');
      expect(groupTitle({ sides: ['source'], kinds: ['added'] })).to.equal('Source added this');
      expect(groupTitle({ sides: ['local'], kinds: ['added'] })).to.equal('You added this');
      expect(groupTitle({ sides: ['source'], kinds: ['added'], reason: 'both-changed' })).to.equal('Source changed this · You removed it');
      expect(groupTitle({ sides: ['local'], kinds: ['added'], reason: 'both-changed' })).to.equal('You changed this · Source removed it');
    });

    it('gives plain words for each reason code', () => {
      ['both-changed', 'differs', 'no-baseline', 'page-too-large', 'reviewing-open-markup']
        .forEach((code) => expect(reasonText(code)).to.not.equal(''));
      expect(reasonText('unknown')).to.equal('');
    });
  });

  describe('cards', () => {
    beforeEach(async () => {
      editor = await openEditor(PAGE);
    });

    it('renders one card per group and today\'s view for ungrouped markup', () => {
      expect(cards(editor.view).map((el) => el.dataset.diffGroup)).to.deep.equal(['g1', 'g2', 'g3']);
      expect(editor.view.dom.querySelectorAll('.legacy-deleted')).to.have.length(1);
      expect(editor.view.dom.querySelector('da-diff-base')).to.equal(null);
    });

    it('shows both sides and the collapsed original', () => {
      const g1 = card(editor.view, 'g1');
      expect(g1.querySelector('.diff-group-title').textContent).to.equal('Source changed this · You changed this');
      expect(g1.querySelector('.is-source').textContent).to.include('Alpha source');
      expect(g1.querySelector('.is-source').textContent).to.include('Yankee source');
      expect(g1.querySelector('.is-local').textContent).to.include('Alpha local');
      const base = g1.querySelector('details.diff-group-base');
      expect(base.open).to.equal(false);
      expect(base.textContent).to.include('Alpha base');
      expect(buttons(g1)).to.deep.equal(['Keep mine', 'Take source', 'Keep both']);
    });

    it('offers no keep both for a one-sided group', () => {
      const g3 = card(editor.view, 'g3');
      expect(g3.querySelector('.diff-group-title').textContent).to.equal('You changed this · Source removed it');
      expect(g3.querySelector('.is-source')).to.equal(null);
      expect(buttons(g3)).to.deep.equal(['Keep mine', 'Take source']);
    });

    it('resolves a group from its card', () => {
      card(editor.view, 'g1').querySelector('.is-choose-mine').click();
      expect(cards(editor.view).map((el) => el.dataset.diffGroup)).to.deep.equal(['g2', 'g3']);
      expect(editor.view.dom.textContent).to.include('Alpha local');
      expect(editor.view.dom.textContent).to.not.include('Alpha source');
    });
  });

  describe('review bar', () => {
    beforeEach(async () => {
      editor = await openEditor(PAGE, { withPlugin: true });
      await waitFor(600);
    });

    const bar = () => editor.view.dom.parentNode.querySelector('.diff-review-bar');

    it('shows the group count and fills card text from diffSummary', () => {
      expect(bar().querySelector('.diff-review-count').textContent).to.equal('3 conflicts to review');
      const g1 = card(editor.view, 'g1');
      expect(g1.querySelector('.diff-group-reason').textContent).to.equal(reasonText('both-changed'));
      expect(g1.querySelector('summary').textContent).to.equal('Was: Alpha base');
      expect(card(editor.view, 'g3').querySelector('.diff-group-reason').textContent)
        .to.include('The original is not available.');
    });

    it('moves between groups', () => {
      const next = bar().querySelector('.is-next');
      next.click();
      expect(card(editor.view, 'g1').classList.contains('is-current')).to.equal(true);
      next.click();
      expect(card(editor.view, 'g2').classList.contains('is-current')).to.equal(true);
      expect(card(editor.view, 'g1').classList.contains('is-current')).to.equal(false);
      bar().querySelector('.is-prev').click();
      bar().querySelector('.is-prev').click();
      expect(card(editor.view, 'g3').classList.contains('is-current')).to.equal(true);
    });

    it('accept all source resolves everything and removes the bar', async () => {
      bar().querySelector('.is-all-source').click();
      expect(cards(editor.view)).to.have.length(0);
      expect(editor.view.dom.querySelectorAll('.legacy-deleted, .legacy-added')).to.have.length(0);
      await waitFor(600);
      expect(bar()).to.equal(null);
    });

    it('updates the count after one group is resolved', async () => {
      card(editor.view, 'g2').querySelector('.is-choose-source').click();
      await waitFor(600);
      expect(bar().querySelector('.diff-review-count').textContent).to.equal('2 conflicts to review');
    });
  });
});
