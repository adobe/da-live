import { expect } from '@esm-bundle/chai';
import { adaptPreflightResults } from '../../../../../blocks/canvas/ew-preflight/adapter.js';
import { STATUS, SEVERITY, createResult } from '../../../../../blocks/edit/da-prepare/actions/preflight/views/result.js';

function settledItem(result, reason = 'reason') {
  const item = createResult();
  item.settle(result, reason);
  return item;
}

function pendingItem() {
  const item = createResult();
  item.status = STATUS.PENDING;
  return item;
}

function categories(items) {
  return [{ title: 'Content', checks: [{ title: 'H1', items, done: true }] }];
}

describe('adaptPreflightResults', () => {
  it('returns empty buckets for no categories', () => {
    const data = adaptPreflightResults([]);
    expect(data.title).to.equal('Preflight');
    expect(data.summary.map((t) => t.value)).to.deep.equal([0, 0, 0]);
    expect(data.sections.every((s) => s.items.length === 0)).to.be.true;
  });

  it('buckets ERROR and WARN as failed', () => {
    const data = adaptPreflightResults(categories([
      settledItem(SEVERITY.ERROR),
      settledItem(SEVERITY.WARN),
    ]));
    const failed = data.sections.find((s) => s.label === 'Failed checks');
    expect(failed.items).to.have.length(2);
  });

  it('buckets SUCCESS and INFO as passed', () => {
    const data = adaptPreflightResults(categories([
      settledItem(SEVERITY.SUCCESS),
      settledItem(SEVERITY.INFO),
    ]));
    const passed = data.sections.find((s) => s.label === 'Passed checks');
    expect(passed.items).to.have.length(2);
  });

  it('buckets NA as not applicable', () => {
    const data = adaptPreflightResults(categories([settledItem(SEVERITY.NA)]));
    const na = data.sections.find((s) => s.label === 'Not applicable');
    expect(na.items).to.have.length(1);
  });

  it('excludes items that have not settled yet', () => {
    const data = adaptPreflightResults(categories([pendingItem()]));
    expect(data.summary.map((t) => t.value)).to.deep.equal([0, 0, 0]);
  });

  it('carries the category title and reason onto each item', () => {
    const data = adaptPreflightResults(categories([settledItem(SEVERITY.ERROR, 'missing h1')]));
    const [item] = data.sections.find((s) => s.label === 'Failed checks').items;
    expect(item.category).to.equal('Content');
    expect(item.title).to.equal('H1');
    expect(item.description).to.equal('missing h1');
    expect(item.check.context.category).to.equal('Content');
  });

  it('opens the Failed section by default when there are failures, otherwise Passed', () => {
    const withFailures = adaptPreflightResults(categories([settledItem(SEVERITY.ERROR)]));
    expect(withFailures.sections.find((s) => s.label === 'Failed checks').defaultOpen).to.be.true;
    expect(withFailures.sections.find((s) => s.label === 'Passed checks').defaultOpen).to.be.false;

    const allPassing = adaptPreflightResults(categories([settledItem(SEVERITY.SUCCESS)]));
    expect(allPassing.sections.find((s) => s.label === 'Failed checks').defaultOpen).to.be.false;
    expect(allPassing.sections.find((s) => s.label === 'Passed checks').defaultOpen).to.be.true;
  });
});
