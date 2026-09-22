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
    expect(data.summary.map((t) => t.value)).to.deep.equal([0, 0, 0]);
    expect(data.sections.every((s) => s.entries.length === 0)).to.be.true;
  });

  it('buckets ERROR and WARN as failed', () => {
    const data = adaptPreflightResults(categories([
      settledItem(SEVERITY.ERROR),
      settledItem(SEVERITY.WARN),
    ]));
    const failed = data.sections.find((s) => s.label === 'Failed checks');
    expect(failed.entries).to.have.length(2);
  });

  it('buckets SUCCESS and INFO as passed', () => {
    const data = adaptPreflightResults(categories([
      settledItem(SEVERITY.SUCCESS),
      settledItem(SEVERITY.INFO),
    ]));
    const passed = data.sections.find((s) => s.label === 'Passed checks');
    expect(passed.entries).to.have.length(2);
  });

  it('buckets NA as not applicable', () => {
    const data = adaptPreflightResults(categories([settledItem(SEVERITY.NA)]));
    const na = data.sections.find((s) => s.label === 'Not applicable');
    expect(na.entries).to.have.length(1);
  });

  it('excludes items that have not settled yet', () => {
    const data = adaptPreflightResults(categories([pendingItem()]));
    expect(data.summary.map((t) => t.value)).to.deep.equal([0, 0, 0]);
  });

  it('carries the category title, check title, and the live item element onto each entry', () => {
    const settled = settledItem(SEVERITY.ERROR, 'missing h1');
    const data = adaptPreflightResults(categories([settled]));
    const [entry] = data.sections.find((s) => s.label === 'Failed checks').entries;
    expect(entry.category).to.equal('Content');
    expect(entry.title).to.equal('H1');
    expect(entry.item).to.equal(settled);
  });

  it('opens the Failed section by default when there are failures, otherwise Passed', () => {
    const withFailures = adaptPreflightResults(categories([settledItem(SEVERITY.ERROR)]));
    expect(withFailures.sections.find((s) => s.label === 'Failed checks').defaultOpen).to.be.true;
    expect(withFailures.sections.find((s) => s.label === 'Passed checks').defaultOpen).to.be.false;

    const allPassing = adaptPreflightResults(categories([settledItem(SEVERITY.SUCCESS)]));
    expect(allPassing.sections.find((s) => s.label === 'Failed checks').defaultOpen).to.be.false;
    expect(allPassing.sections.find((s) => s.label === 'Passed checks').defaultOpen).to.be.true;
  });

  it('uses SEVERITY values for summary tiles and section badges', () => {
    const data = adaptPreflightResults([]);
    expect(data.summary.map((t) => t.severity)).to.deep.equal([
      SEVERITY.ERROR, SEVERITY.SUCCESS, SEVERITY.NA,
    ]);
    expect(data.sections.map((s) => s.severity)).to.deep.equal([
      SEVERITY.ERROR, SEVERITY.SUCCESS, SEVERITY.NA,
    ]);
  });
});
