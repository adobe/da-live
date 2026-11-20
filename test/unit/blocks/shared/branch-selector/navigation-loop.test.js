import { expect } from '@esm-bundle/chai';
import { installBranchHashGuard } from '../../../../../blocks/shared/branch-selector/navigation.js';

describe('branch history navigation', () => {
  it('commits Back/Forward with replaceState and reloads once without another hashchange', async () => {
    const originalUrl = window.location.href;
    const originalState = history.state;
    const originalInert = document.body.inert;
    const editor = document.createElement('da-content');
    let flushes = 0;
    let reloads = 0;
    let forwarded = 0;
    const onHashChange = () => { forwarded += 1; };
    editor.forceSave = async () => {
      flushes += 1;
      return { ok: true };
    };
    try {
      document.body.append(editor);
      const base = `${window.location.pathname}?da-admin=local&nx=local`;
      history.replaceState({ marker: 1 }, '', `${base}#/org/site~work/page`);
      installBranchHashGuard({ reload: () => { reloads += 1; }, defaultMatches: async () => true });
      window.addEventListener('hashchange', onHashChange);
      const { length } = history;
      history.replaceState({ marker: 2 }, '', `${base}#/org/site/page`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await new Promise((resolve) => { setTimeout(resolve, 30); });
      expect(window.location.hash).to.equal('#/org/site/page');
      expect(window.location.search).to.equal('?da-admin=local&nx=local');
      expect(history.length).to.equal(length);
      expect(history.state).to.deep.equal({ marker: 2 });
      expect(flushes).to.equal(1);
      expect(reloads).to.equal(1);
      expect(forwarded).to.equal(0);
    } finally {
      window.removeEventListener('hashchange', onHashChange);
      editor.remove();
      document.body.inert = originalInert;
      history.replaceState(originalState, '', originalUrl);
    }
  });
});
