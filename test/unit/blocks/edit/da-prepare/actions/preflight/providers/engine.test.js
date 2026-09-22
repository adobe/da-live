import { expect } from '@esm-bundle/chai';
import {
  isItemSettled,
  isHiddenItem,
  computeOverallStatus,
} from '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/engine.js';
import { STATUS, SEVERITY } from '../../../../../../../../blocks/edit/da-prepare/actions/preflight/views/result.js';

describe('isItemSettled', () => {
  it('is false for a missing item', () => {
    expect(isItemSettled(null)).to.be.false;
  });

  it('is false while pending', () => {
    expect(isItemSettled({ status: STATUS.PENDING })).to.be.false;
  });

  it('is false for an unexpected status value', () => {
    expect(isItemSettled({ status: 'bogus' })).to.be.false;
  });

  it('is true once done', () => {
    expect(isItemSettled({ status: STATUS.DONE })).to.be.true;
  });
});

describe('isHiddenItem', () => {
  it('is false while pending, even with an NA result', () => {
    expect(isHiddenItem({ status: STATUS.PENDING, result: SEVERITY.NA })).to.be.false;
  });

  it('is false once done with a non-NA result', () => {
    expect(isHiddenItem({ status: STATUS.DONE, result: SEVERITY.SUCCESS })).to.be.false;
  });

  it('is true once done with an NA result', () => {
    expect(isHiddenItem({ status: STATUS.DONE, result: SEVERITY.NA })).to.be.true;
  });
});

describe('computeOverallStatus', () => {
  const item = (result) => ({ status: STATUS.DONE, result });
  const settledCats = (items) => [
    { title: 'Content', checks: [{ title: 'H1', items, done: true }] },
  ];

  it('is undefined until every item is done', () => {
    const categories = [
      { title: 'Content', checks: [{ title: 'H1', items: [{ status: STATUS.PENDING }], done: false }] },
    ];
    expect(computeOverallStatus(categories)).to.be.undefined;
  });

  it('is undefined while a check is marked done but an item is still pending', () => {
    const categories = [
      { title: 'References', checks: [{ title: 'Links', items: [{ status: STATUS.PENDING }], done: true }] },
    ];
    expect(computeOverallStatus(categories)).to.be.undefined;
  });

  it('is success when no result is an error', () => {
    const categories = settledCats([item(SEVERITY.INFO), item(SEVERITY.SUCCESS)]);
    expect(computeOverallStatus(categories)).to.equal('success');
  });

  it('is fail when any result is an error', () => {
    const categories = settledCats([item(SEVERITY.INFO), item(SEVERITY.ERROR)]);
    expect(computeOverallStatus(categories)).to.equal('fail');
  });
});
