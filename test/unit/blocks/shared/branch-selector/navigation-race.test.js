import { expect } from '@esm-bundle/chai';
import { installBranchHashGuard } from '../../../../../blocks/shared/branch-selector/navigation.js';

describe('branch history navigation races', () => {
  it('does not let an older pending validation overwrite a newer transition', async () => {
    const originalUrl = window.location.href;
    const originalState = history.state;
    const originalInert = document.body.inert;
    const pending = new Map();
    let reloads = 0;
    const validate = ({ branch }) => new Promise((resolve) => { pending.set(branch, resolve); });
    try {
      history.replaceState(null, '', '#/org/site/page');
      installBranchHashGuard({ validate, reload: () => { reloads += 1; } });
      history.replaceState(null, '', '#/org/site~first/page');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      history.replaceState(null, '', '#/org/site~second/page');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      pending.get('second')();
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      expect(window.location.hash).to.equal('#/org/site~second/page');
      expect(reloads).to.equal(1);
      pending.get('first')();
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      expect(window.location.hash).to.equal('#/org/site~second/page');
      expect(reloads).to.equal(1);
      expect(document.querySelector('[role="alert"]')).to.equal(null);
    } finally {
      document.body.inert = originalInert;
      history.replaceState(originalState, '', originalUrl);
    }
  });
});
