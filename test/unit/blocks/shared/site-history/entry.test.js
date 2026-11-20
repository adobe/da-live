import { expect } from '@esm-bundle/chai';
import { historyAvailable, matchesDefaultSite } from '../../../../../blocks/shared/site-history/entry.js';

describe('site history entry', () => {
  it('only accepts a matching bare site in the actual hash', () => {
    expect(matchesDefaultSite('org', 'site', '#/org/site/folder')).to.be.true;
    expect(matchesDefaultSite('org', 'site', '#/org/site~work/')).to.be.false;
    expect(matchesDefaultSite('org', 'site~work', '#/org/site~work/')).to.be.false;
    expect(matchesDefaultSite('org', 'site', '#/other/site/')).to.be.false;
  });

  it('discovers asynchronously only for a valid bound default site', async () => {
    const calls = [];
    const deps = {
      matchesBinding: async (...args) => { calls.push(['binding', ...args]); return true; },
      discover: async (...args) => { calls.push(['discover', ...args]); return { status: 'available' }; },
    };
    expect(await historyAvailable('org', 'site~work', deps)).to.be.false;
    expect(await historyAvailable('org', null, deps)).to.be.false;
    expect(calls).to.have.length(0);
    expect(await historyAvailable('org', 'site', deps)).to.be.true;
    expect(calls).to.deep.equal([['binding', 'org', 'site'], ['discover', 'org', 'site']]);
    deps.matchesBinding = async () => false;
    calls.length = 0;
    expect(await historyAvailable('org', 'site', deps)).to.be.false;
    expect(calls).to.have.length(0);
    deps.matchesBinding = async () => true;
    deps.discover = async () => ({ status: 'unsupported' });
    expect(await historyAvailable('org', 'site', deps)).to.be.false;
    deps.discover = async () => { throw new Error('offline'); };
    expect(await historyAvailable('org', 'site', deps)).to.be.false;
  });
});
