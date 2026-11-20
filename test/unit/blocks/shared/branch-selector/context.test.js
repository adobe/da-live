import { expect } from '@esm-bundle/chai';
import { branchContext, pathMatchesActiveBranch, validateBranch } from '../../../../../blocks/shared/branch-selector/context.js';
import { DA_RS_PROVIDER } from '../../../../../blocks/shared/branching.js';

describe('content branch ingress', () => {
  const context = { org: 'org', site: 'site', branch: 'work', siteSegment: 'site~work' };

  it('reads the canonical raw alias and rejects encoded or invalid aliases', () => {
    expect(branchContext('#/org/site~work/a')).to.deep.equal(context);
    expect(branchContext('#/org/site/a')).to.equal(null);
    expect(() => branchContext('#/org/site%257ework/a')).to.throw();
    expect(() => branchContext('#/org/site~main/a')).to.throw();
  });

  it('does not send a branch recent item through an unscoped default context', () => {
    const original = window.location.href;
    try {
      history.replaceState(null, '', '#/org/site');
      expect(pathMatchesActiveBranch('/org/site~work/page.html')).to.equal(false);
      expect(pathMatchesActiveBranch('/org/site/page.html')).to.equal(true);
      history.replaceState(null, '', '#/org/site~work');
      expect(pathMatchesActiveBranch('/org/site~work/page.html')).to.equal(true);
      expect(pathMatchesActiveBranch('/org/site~other/page.html')).to.equal(false);
    } finally {
      history.replaceState(null, '', original);
    }
  });

  it('binds discovery to da-rs and checks selected branch metadata', async () => {
    let captured;
    const discovery = {
      discover: async (value) => {
        captured = value;
        return { status: 'available', capabilities: { defaultBranchId: 'main' } };
      },
    };
    const createClient = () => ({ get: async (id) => ({ id }) });
    const result = await validateBranch(context, { discovery, createClient });
    expect(captured).to.deep.equal({ providerId: DA_RS_PROVIDER, org: 'org', site: 'site' });
    expect(result.branch.id).to.equal('work');
  });

  it('blocks unsupported, unavailable and mismatched metadata without fallback', async () => {
    for (const status of ['unsupported', 'unavailable']) {
      let called = false;
      const discovery = { discover: async () => ({ status }) };
      try {
        // eslint-disable-next-line no-await-in-loop
        await validateBranch(context, { discovery, createClient: () => { called = true; } });
        throw new Error('Expected validation failure');
      } catch (error) {
        expect(error.message).to.include(status);
      }
      expect(called).to.equal(false);
    }
    const discovery = { discover: async () => ({ status: 'available' }) };
    try {
      await validateBranch(context, { discovery, createClient: () => ({ get: async () => ({ id: 'other' }) }) });
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error.message).to.include('does not match');
    }
  });
});
