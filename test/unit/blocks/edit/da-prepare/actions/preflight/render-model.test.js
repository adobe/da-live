import { expect } from '@esm-bundle/chai';
import { buildRenderModel } from '../../../../../../../blocks/edit/da-prepare/actions/preflight/render-model.js';

function category(title, checks) {
  return { title, checks };
}

describe('buildRenderModel', () => {
  it('returns empty summary counts and empty sections for no categories', () => {
    const { summary, sections } = buildRenderModel([]);
    expect(summary).to.deep.equal([
      { label: 'Failed', value: 0, tone: 'negative' },
      { label: 'Passed', value: 0, tone: 'positive' },
      { label: 'Not applicable', value: 0, tone: 'neutral' },
    ]);
    expect(sections.map((s) => s.items.length)).to.deep.equal([0, 0, 0]);
  });

  it('buckets error and warn into the Failed section', () => {
    const categories = [
      category('SEO', [
        { title: 'H1', results: [{ reason: 'No H1', badge: 'error' }] },
        { title: 'Description', results: [{ reason: 'Missing', badge: 'warn' }] },
      ]),
    ];
    const { summary, sections } = buildRenderModel(categories);
    expect(summary.find((s) => s.label === 'Failed').value).to.equal(2);
    const failedSection = sections.find((s) => s.label === 'Failed checks');
    expect(failedSection.items.map((i) => i.title)).to.deep.equal(['H1', 'Description']);
  });

  it('buckets success into Passed and info into Not applicable', () => {
    const categories = [
      category('Content', [
        { title: 'Lorem', results: [{ reason: 'Clean', badge: 'success' }] },
        { title: 'Title', results: [{ reason: 'FYI', badge: 'info' }] },
      ]),
    ];
    const { summary } = buildRenderModel(categories);
    expect(summary.find((s) => s.label === 'Passed').value).to.equal(1);
    expect(summary.find((s) => s.label === 'Not applicable').value).to.equal(1);
  });

  it('flattens multiple results across multiple checks and categories', () => {
    const categories = [
      category('A', [{ title: 'Check1', results: [{ reason: 'r1', badge: 'error' }, { reason: 'r2', badge: 'success' }] }]),
      category('B', [{ title: 'Check2', results: [{ reason: 'r3', badge: 'info' }] }]),
    ];
    const { summary } = buildRenderModel(categories);
    expect(summary).to.deep.equal([
      { label: 'Failed', value: 1, tone: 'negative' },
      { label: 'Passed', value: 1, tone: 'positive' },
      { label: 'Not applicable', value: 1, tone: 'neutral' },
    ]);
  });

  it('tags each item with its originating category and check title', () => {
    const categories = [category('SEO', [{ title: 'H1', results: [{ reason: 'No H1', badge: 'error' }] }])];
    const { sections } = buildRenderModel(categories);
    const item = sections.find((s) => s.label === 'Failed checks').items[0];
    expect(item).to.deep.equal({
      title: 'H1',
      category: 'SEO',
      result: { reason: 'No H1', badge: 'error' },
      tone: 'negative',
    });
  });

  it('defaults Failed open when there are failures, Passed open otherwise', () => {
    const withFailure = buildRenderModel([
      category('A', [{ title: 'x', results: [{ reason: 'r', badge: 'error' }] }]),
    ]);
    expect(withFailure.sections.find((s) => s.label === 'Failed checks').defaultOpen).to.be.true;
    expect(withFailure.sections.find((s) => s.label === 'Passed checks').defaultOpen).to.be.false;

    const noFailure = buildRenderModel([
      category('A', [{ title: 'x', results: [{ reason: 'r', badge: 'success' }] }]),
    ]);
    expect(noFailure.sections.find((s) => s.label === 'Failed checks').defaultOpen).to.be.false;
    expect(noFailure.sections.find((s) => s.label === 'Passed checks').defaultOpen).to.be.true;
  });

  it('passes an HTMLElement result through untouched, still tagged with tone', () => {
    const el = document.createElement('span');
    el.badge = 'warn';
    const categories = [category('References', [{ title: 'Links', results: [el] }])];
    const { sections } = buildRenderModel(categories);
    const item = sections.find((s) => s.label === 'Failed checks').items[0];
    expect(item.result).to.equal(el);
    expect(item.tone).to.equal('negative');
  });

  it('subLabel pluralizes correctly for zero, one, and many', () => {
    const zero = buildRenderModel([]);
    expect(zero.sections.find((s) => s.label === 'Failed checks').subLabel).to.equal('0 checks failed');

    const one = buildRenderModel([category('A', [{ title: 'x', results: [{ reason: 'r', badge: 'error' }] }])]);
    expect(one.sections.find((s) => s.label === 'Failed checks').subLabel).to.equal('1 check failed');
  });
});
