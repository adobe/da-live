import { expect } from '@esm-bundle/chai';
import { installBranchHashGuard } from '../../../../../blocks/shared/branch-selector/navigation.js';

describe('single-author document navigation', () => {
  it('prevents a same-branch navigation when the direct save fails', async () => {
    const original = window.location.href;
    const editor = document.createElement('da-content');
    editor.wsProvider = { singleAuthor: {} };
    let flushes = 0;
    editor.forceSave = async () => {
      flushes += 1;
      return { ok: false, error: 'save failed' };
    };
    try {
      document.body.append(editor);
      history.replaceState(null, '', '#/demo/site/page');
      installBranchHashGuard();
      history.replaceState(null, '', '#/demo/site/other');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await new Promise((resolve) => { setTimeout(resolve, 30); });
      expect(window.location.hash).to.equal('#/demo/site/page');
      expect(flushes).to.equal(1);
      expect(document.querySelector('[role="alert"]')?.textContent).to.include('save failed');
    } finally {
      editor.remove();
      document.querySelector('[role="alert"]')?.remove();
      history.replaceState(null, '', original);
    }
  });
});
