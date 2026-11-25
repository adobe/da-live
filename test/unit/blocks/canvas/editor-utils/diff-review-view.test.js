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
<p da-diff-added="" data-diff-group="g3" data-diff-side="local" data-diff-kind="removed" data-diff-reason="both-changed">Charlie local</p>
<da-diff-deleted data-mdast="ignore" data-diff-group="g4" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed"><div class="columns"><div><div>Col source</div></div></div></da-diff-deleted>
<div class="columns" da-diff-added="" data-diff-group="g4" data-diff-side="local" data-diff-kind="changed"><div><div>Col local</div></div></div>
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
    it('states what the card holds from the sides, kind and reason', () => {
      const both = { sides: ['source', 'local'], kinds: ['changed'] };
      expect(groupTitle({ ...both, reason: 'both-changed' })).to.equal('Changed in Upstream and Local');
      expect(groupTitle({ ...both, reason: 'no-baseline' })).to.equal('Different in Upstream and Local');
      expect(groupTitle({ ...both, reason: 'differs' })).to.equal('Different in Upstream and Local');
      expect(groupTitle({ sides: ['source'], kinds: ['added'] })).to.equal('Added in Upstream');
      expect(groupTitle({ sides: ['local'], kinds: ['added'] })).to.equal('Added in Local');
      expect(groupTitle({ sides: ['local'], kinds: ['removed'] })).to.equal('Removed in Upstream, edited in Local');
      expect(groupTitle({ sides: ['source', 'local'] }, { local: 'Canada', upstream: 'Global' }))
        .to.equal('Changed in Global and Canada');
    });

    it('explains only the fallback reasons', () => {
      ['no-baseline', 'page-too-large', 'reviewing-open-markup']
        .forEach((code) => expect(reasonText(code)).to.not.equal(''));
      ['both-changed', 'differs', 'unknown', undefined]
        .forEach((code) => expect(reasonText(code)).to.equal(''));
    });
  });

  describe('cards', () => {
    beforeEach(async () => {
      editor = await openEditor(PAGE);
    });

    it('renders one card per group and today\'s view for ungrouped markup', () => {
      expect(cards(editor.view).map((el) => el.dataset.diffGroup)).to.deep.equal(['g1', 'g2', 'g3', 'g4']);
      expect(editor.view.dom.querySelectorAll('.legacy-deleted')).to.have.length(1);
      expect(editor.view.dom.querySelector('da-diff-base')).to.equal(null);
    });

    it('shows both sides and the collapsed original', () => {
      const g1 = card(editor.view, 'g1');
      expect(g1.querySelector('.diff-group-title').textContent).to.equal('Changed in Upstream and Local');
      expect(g1.querySelector('.is-source').textContent).to.include('Alpha source');
      expect(g1.querySelector('.is-source').textContent).to.include('Yankee source');
      expect(g1.querySelector('.is-local').textContent).to.include('Alpha local');
      const base = g1.querySelector('details.diff-group-base');
      expect(base.open).to.equal(false);
      expect(base.querySelector('summary').textContent).to.equal('Last rollout');
      expect(base.textContent).to.include('Alpha base');
      expect(base.previousElementSibling.matches('.diff-group-sides')).to.equal(true);
      expect(base.nextElementSibling.matches('.diff-group-reason')).to.equal(true);
      expect(buttons(g1)).to.deep.equal(['Accept Upstream', 'Preserve Local', 'Keep both']);
    });

    it('offers no keep both for a one-sided group', () => {
      const g3 = card(editor.view, 'g3');
      expect(g3.querySelector('.diff-group-title').textContent).to.equal('Removed in Upstream, edited in Local');
      const upstream = g3.querySelector('.is-source');
      expect(upstream.classList.contains('is-empty')).to.equal(true);
      expect(upstream.querySelector('.diff-group-side-empty').textContent).to.equal('Removed');
      expect(g3.querySelector('.is-local .diff-group-side-content').textContent).to.include('Charlie local');
      expect(buttons(g3)).to.deep.equal(['Accept Upstream', 'Preserve Local']);
    });

    it('resolves a group from its card', () => {
      card(editor.view, 'g1').querySelector('.is-choose-mine').click();
      expect(cards(editor.view).map((el) => el.dataset.diffGroup)).to.deep.equal(['g2', 'g3', 'g4']);
      expect(editor.view.dom.textContent).to.include('Alpha local');
      expect(editor.view.dom.textContent).to.not.include('Alpha source');
    });
  });

  describe('layout', () => {
    beforeEach(async () => {
      editor = await openEditor(PAGE);
    });

    const diff = (id, cls) => card(editor.view, id).querySelector(`.${cls} .diff-group-side-diff`);
    const text = (el, tag) => [...el.querySelectorAll(tag)].map((n) => n.textContent).join(' ');

    it('diffs each side against the last rollout when there is one', () => {
      const source = diff('g1', 'is-source');
      expect(text(source, 'del')).to.include('base');
      expect(text(source, 'ins')).to.include('source');
      expect(text(source, 'ins')).to.include('Yankee');
      const local = diff('g1', 'is-local');
      expect(text(local, 'del')).to.include('base');
      expect(text(local, 'ins')).to.include('local');
      expect(source.getAttribute('aria-label')).to.equal('Changes from Last rollout to Upstream');
      expect(local.getAttribute('aria-label')).to.equal('Changes from Last rollout to Local');
    });

    it('diffs each side against the other side without a last rollout', () => {
      const source = diff('g2', 'is-source');
      expect(text(source, 'del')).to.include('local');
      expect(text(source, 'ins')).to.include('source');
      const local = diff('g2', 'is-local');
      expect(text(local, 'del')).to.include('source');
      expect(text(local, 'ins')).to.include('local');
      expect(local.getAttribute('aria-label')).to.equal('Changes from Upstream to Local');
    });

    it('marks all of a one-sided group as added', () => {
      const local = diff('g3', 'is-local');
      expect(local.querySelector('del')).to.equal(null);
      expect(text(local, 'ins')).to.include('Charlie local');
      expect(card(editor.view, 'g3').querySelector('.is-source').classList.contains('has-diff')).to.equal(false);
    });

    it('diffs the text inside a block that kept its shape', () => {
      const local = diff('g4', 'is-local');
      expect(local.querySelector('table')).to.not.equal(null);
      expect(text(local, 'del')).to.include('source');
      expect(text(local, 'ins')).to.include('local');
      expect(card(editor.view, 'g4').querySelectorAll('.has-diff')).to.have.length(2);
    });

    it('ignores editor ids when diffing a block', async () => {
      const page = `<body><header></header><main><div>
<da-diff-deleted data-mdast="ignore" data-diff-group="d1" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed"><div class="cards" data-id="up1"><div><div>Kitchen over $50.</div></div></div></da-diff-deleted>
<div class="cards" data-id="lo1" da-diff-added="" data-diff-group="d1" data-diff-side="local" data-diff-kind="changed"><div><div>Kitchen over $75.</div></div></div>
<p>After</p>
</div></main><footer></footer></body>`;
      destroyEditor(editor);
      editor = await openEditor(page);
      const local = diff('d1', 'is-local');
      expect(local.querySelector('[data-diffmod], .diffmod')).to.equal(null);
      expect(text(local, 'del')).to.include('50');
      expect(text(local, 'ins')).to.include('75');
    });

    it('diffs a block with images against its base', async () => {
      const pic = (src) => `<picture><source srcset="${src}"><img src="${src}" alt="Room"></picture>`;
      const block = (src, copy, attrs = '') => `<div class="cards"${attrs}><div><div>${pic(src)}</div><div><p>${copy}</p></div></div></div>`;
      const page = `<body><header></header><main><div>
<da-diff-base data-mdast="ignore" data-diff-group="c1">${block('/a.png', 'Over $50.')}</da-diff-base>
<da-diff-deleted data-mdast="ignore" data-diff-group="c1" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed">${block('/b.png', 'Over $50.')}</da-diff-deleted>
${block('/a.png', 'Over $75.', ' da-diff-added="" data-diff-group="c1" data-diff-side="local" data-diff-kind="changed"')}
<p>After</p>
</div></main><footer></footer></body>`;
      destroyEditor(editor);
      editor = await openEditor(page);
      expect(diff('c1', 'is-source').querySelector('ins img').getAttribute('src')).to.equal('/b.png');
      expect(text(diff('c1', 'is-local'), 'ins')).to.include('75');
    });

    it('builds no diff for a block whose shape changed', async () => {
      const page = `<body><header></header><main><div>
<da-diff-deleted data-mdast="ignore" data-diff-group="b1" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed"><div class="columns"><div><div>One</div><div>Two</div></div></div></da-diff-deleted>
<div class="columns" da-diff-added="" data-diff-group="b1" data-diff-side="local" data-diff-kind="changed"><div><div>One</div></div><div><div>Two</div></div></div>
<p>After</p>
</div></main><footer></footer></body>`;
      destroyEditor(editor);
      editor = await openEditor(page);
      expect(card(editor.view, 'b1').querySelectorAll('.has-diff')).to.have.length(0);
    });

    it('marks added, removed and replaced images', async () => {
      const img = (src, attrs = '') => `<img src="${src}" alt="Chair"${attrs}>`;
      const dm = (src) => `<a href="${src}" data-edit-as="image" title="Chair">${src}</a>`;
      const pair = (id, source, local) => `<da-diff-deleted data-mdast="ignore" data-diff-group="${id}" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed">${source}</da-diff-deleted><da-diff-added data-diff-group="${id}" data-diff-side="local" data-diff-kind="changed">${local}</da-diff-added>`;
      const page = `<body><header></header><main><div>
${pair('i1', `<p>Text ${img('/a.png')}</p>`, `<p>Text ${img('/b.png')}</p>`)}
<p>One</p>
${pair('i2', '<p>Text</p>', `<p>Text ${img('/a.png')}</p>`)}
<p>Two</p>
${pair('i3', `<p>${dm('https://delivery-p1.adobeaemcloud.com/a.jpg')}</p>`, `<p>${dm('https://delivery-p1.adobeaemcloud.com/b.jpg')}</p>`)}
<p>Three</p>
</div></main><footer></footer></body>`;
      destroyEditor(editor);
      editor = await openEditor(page);
      const replaced = diff('i1', 'is-local');
      expect(replaced.querySelector('del img').getAttribute('src')).to.equal('/a.png');
      expect(replaced.querySelector('ins img').getAttribute('src')).to.equal('/b.png');
      expect(replaced.querySelector('[data-diffmod]')).to.equal(null);
      expect(diff('i2', 'is-local').querySelector('ins img').getAttribute('src')).to.equal('/a.png');
      expect(diff('i2', 'is-source').querySelector('del img').getAttribute('src')).to.equal('/a.png');
      const delivery = diff('i3', 'is-local');
      expect(delivery.querySelector('del img[data-edit-as="image"]').getAttribute('src')).to.include('a.jpg');
      expect(delivery.querySelector('ins img[data-edit-as="image"]').getAttribute('src')).to.include('b.jpg');
    });

    it('builds a diff for whole lists, quotes and code', async () => {
      const pair = (id, source, local) => `<da-diff-deleted data-mdast="ignore" data-diff-group="${id}" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed">${source}</da-diff-deleted><da-diff-added data-diff-group="${id}" data-diff-side="local" data-diff-kind="changed">${local}</da-diff-added>`;
      const page = `<body><header></header><main><div>
${pair('l1', '<ul><li>Free parking</li><li>Returns for 45 days</li></ul>', '<ul><li>Free parking</li><li>Returns for 60 days</li></ul>')}
<p>One</p>
${pair('l2', '<ol><li>Step source</li></ol>', '<ol><li>Step local</li></ol>')}
<p>Two</p>
${pair('q1', '<blockquote><p>Quote source</p></blockquote>', '<blockquote><p>Quote local</p></blockquote>')}
<p>Three</p>
${pair('c1', '<pre><code>let a = 1;</code></pre>', '<pre><code>let a = 2;</code></pre>')}
<p>Four</p>
${pair('n1', '<ul><li><p>Rule source</p><hr></li></ul>', '<ul><li><p>Rule local</p></li></ul>')}
<p>Five</p>
</div></main><footer></footer></body>`;
      destroyEditor(editor);
      editor = await openEditor(page);
      ['l1', 'l2', 'q1', 'c1'].forEach((id) => {
        expect(card(editor.view, id).querySelectorAll('.has-diff'), id).to.have.length(2);
      });
      expect(card(editor.view, 'n1').querySelectorAll('.has-diff')).to.have.length(0);
      const list = diff('l1', 'is-local');
      expect(list.querySelectorAll('li')).to.have.length(2);
      expect(list.querySelector('del').textContent).to.include('45');
      expect(list.querySelector('ins').textContent).to.include('60');
    });

    it('names formatting and link changes in the diff', async () => {
      const page = `<body><header></header><main><div>
<da-diff-deleted data-mdast="ignore" data-diff-group="f1" data-diff-side="source" data-diff-kind="changed" data-diff-reason="both-changed"><p>Save 20% at <a href="/a">our store</a> until April</p></da-diff-deleted>
<p da-diff-added="" data-diff-group="f1" data-diff-side="local" data-diff-kind="changed">Save <strong>20%</strong> at <a href="/b">our store</a> until May</p>
<p>After</p>
</div></main><footer></footer></body>`;
      destroyEditor(editor);
      editor = await openEditor(page);
      const local = diff('f1', 'is-local');
      expect(local.querySelector('ins.diffmod').title).to.equal('Formatting changed');
      expect(local.querySelector('a[data-diffmod]').title).to.equal('Link changed');
      expect(local.querySelector('del.diffdel').textContent).to.equal('April');
    });
  });

  describe('review bar', () => {
    beforeEach(async () => {
      editor = await openEditor(PAGE, { withPlugin: true });
      await waitFor(600);
    });

    const bar = () => editor.view.dom.parentNode.querySelector('.diff-review-bar');

    it('shows the group count and fills card text from diffSummary', () => {
      expect(bar().querySelector('.diff-review-count').textContent).to.equal('4 conflicts');
      const g1 = card(editor.view, 'g1');
      expect(g1.querySelector('.diff-group-reason').hidden).to.equal(true);
      expect(g1.querySelector('summary').textContent).to.equal('Last rollout');
      expect(card(editor.view, 'g3').querySelector('.diff-group-reason').hidden).to.equal(true);
    });

    it('explains a fallback reason under the title', async () => {
      destroyEditor(editor);
      editor = await openEditor(PAGE.replaceAll('both-changed', 'no-baseline'), { withPlugin: true });
      await waitFor(600);
      const g1 = card(editor.view, 'g1');
      expect(g1.querySelector('.diff-group-title').textContent).to.equal('Different in Upstream and Local');
      const reason = g1.querySelector('.diff-group-reason');
      expect(reason.hidden).to.equal(false);
      expect(reason.textContent).to.equal('Last rollout not available');
      expect(reason.nextElementSibling.matches('.diff-group-actions')).to.equal(true);
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
      expect(card(editor.view, 'g4').classList.contains('is-current')).to.equal(true);
    });

    it('offers accept all for each side in one menu', () => {
      const menu = bar().querySelector('.diff-review-accept-all');
      expect(menu.items.map(({ label }) => label)).to.deep.equal(['Accept all Upstream', 'Preserve all Local']);
      expect(menu.querySelector('[slot="trigger"]').textContent).to.equal('Resolve all');
    });

    it('accept all source resolves everything and removes the bar', async () => {
      bar().querySelector('.diff-review-accept-all').dispatchEvent(new CustomEvent('select', { detail: { id: 'source' } }));
      expect(cards(editor.view)).to.have.length(0);
      expect(editor.view.dom.querySelectorAll('.legacy-deleted, .legacy-added')).to.have.length(0);
      await waitFor(600);
      expect(bar()).to.equal(null);
    });

    it('updates the count after one group is resolved', async () => {
      card(editor.view, 'g2').querySelector('.is-choose-source').click();
      await waitFor(600);
      expect(bar().querySelector('.diff-review-count').textContent).to.equal('3 conflicts');
    });
  });

  describe('view controls', () => {
    const KEYS = ['da-review-show', 'da-review-diff'];
    const host = () => editor.view.dom.parentNode;
    const show = () => host().querySelector('.diff-review-show');
    const toggle = () => host().querySelector('.diff-review-diff');
    const pick = (value) => show().dispatchEvent(new CustomEvent('change', { detail: { value } }));
    const setDiff = (checked) => toggle().dispatchEvent(new CustomEvent('change', { detail: { checked } }));
    const reopen = async () => {
      destroyEditor(editor);
      editor = await openEditor(PAGE, { withPlugin: true });
      await waitFor(600);
    };

    beforeEach(async () => {
      KEYS.forEach((key) => localStorage.removeItem(key));
      editor = await openEditor(PAGE, { withPlugin: true });
      await waitFor(600);
    });

    afterEach(() => KEYS.forEach((key) => localStorage.removeItem(key)));

    it('shows both sides without a diff by default', () => {
      expect(show().value).to.equal('both');
      expect(show().items.map(({ label }) => label)).to.deep.equal(['Upstream', 'Local', 'Both']);
      expect(host().dataset.reviewShow).to.equal('both');
      expect(host().dataset.reviewDiff).to.equal('false');
      expect(toggle().getAttribute('label')).to.equal('Show diff');
    });

    it('turns on the diff and remembers it', async () => {
      setDiff(true);
      expect(host().dataset.reviewDiff).to.equal('true');
      expect(localStorage.getItem('da-review-diff')).to.equal('true');
      await reopen();
      expect(toggle().checked).to.equal(true);
      expect(host().dataset.reviewDiff).to.equal('true');
    });

    it('keeps the diff on for one side and remembers the side', async () => {
      setDiff(true);
      pick('local');
      expect(host().dataset.reviewShow).to.equal('local');
      expect(host().dataset.reviewDiff).to.equal('true');
      expect(toggle().disabled).to.not.equal(true);
      expect(localStorage.getItem('da-review-show')).to.equal('local');
      await reopen();
      expect(show().value).to.equal('local');
      expect(host().dataset.reviewDiff).to.equal('true');
    });

    it('clears the view when the review ends', async () => {
      host().querySelector('.diff-review-accept-all').dispatchEvent(new CustomEvent('select', { detail: { id: 'source' } }));
      await waitFor(600);
      expect(host().dataset.reviewShow).to.equal(undefined);
      expect(host().dataset.reviewDiff).to.equal(undefined);
    });
  });

  describe('accessibility', () => {
    const host = () => editor.view.dom.parentNode;

    beforeEach(async () => {
      editor = await openEditor(PAGE, { withPlugin: true });
      await waitFor(600);
    });

    it('names each card by its headline', () => {
      const g1 = card(editor.view, 'g1');
      expect(g1.getAttribute('role')).to.equal('group');
      const title = g1.querySelector(`#${g1.getAttribute('aria-labelledby')}`);
      expect(title.classList.contains('diff-group-title')).to.equal(true);
    });

    it('labels each side panel by its chip, without landmarks', () => {
      const g1 = card(editor.view, 'g1');
      g1.querySelectorAll('.diff-group-side').forEach((side) => {
        expect(side.getAttribute('role')).to.equal('group');
        const label = side.querySelector(`#${side.getAttribute('aria-labelledby')}`);
        expect(label.classList.contains('diff-group-side-label')).to.equal(true);
      });
      expect(g1.querySelector('[role="region"]')).to.equal(null);
      g1.querySelectorAll('.diff-group-side-diff').forEach((d) => expect(d.getAttribute('role')).to.equal('group'));
    });

    it('uses a plain group for the bar and announces the count', () => {
      const bar = host().querySelector('.diff-review-bar');
      expect(bar.getAttribute('role')).to.equal('group');
      expect(bar.querySelector('.diff-review-count').getAttribute('aria-live')).to.equal('polite');
    });

    it('moves focus to the next card after resolving one', () => {
      card(editor.view, 'g1').querySelector('.is-choose-source').click();
      expect(editor.view.root.activeElement?.dataset.diffGroup).to.equal('g2');
    });

    it('moves focus to the previous card after resolving the last one', () => {
      card(editor.view, 'g4').querySelector('.is-choose-source').click();
      expect(editor.view.root.activeElement?.dataset.diffGroup).to.equal('g3');
    });

    it('makes a side panel focusable only when it scrolls sideways', async () => {
      const style = document.createElement('style');
      style.textContent = '.diff-group-side { width: 120px; overflow-x: auto; } .diff-group-side table { width: 600px; }';
      document.head.append(style);
      try {
        destroyEditor(editor);
        editor = await openEditor(PAGE, { withPlugin: true });
        await waitFor(600);
        const [wide] = card(editor.view, 'g4').querySelectorAll('.diff-group-side');
        const [narrow] = card(editor.view, 'g1').querySelectorAll('.diff-group-side');
        expect(wide.tabIndex).to.equal(0);
        expect(narrow.hasAttribute('tabindex')).to.equal(false);
      } finally {
        style.remove();
      }
    });
  });
});
