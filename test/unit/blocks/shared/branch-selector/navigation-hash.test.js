import { expect } from '@esm-bundle/chai';
import { installBranchHashGuard } from '../../../../../blocks/shared/branch-selector/navigation.js';

describe('branch hash navigation', () => {
  it('restores the old URL and blocks a Back/Forward transition when flush fails', async () => {
    const originalUrl = window.location.href;
    const originalFetch = window.fetch;
    const editor = document.createElement('da-content');
    let flushes = 0;
    editor.forceSave = async () => {
      flushes += 1;
      return { ok: false, error: 'persist failed' };
    };
    window.fetch = async (url) => {
      if (url.endsWith('/capabilities')) {
        return new Response(JSON.stringify({
          supported: true,
          apiVersion: 1,
          defaultBranchId: 'main',
          addressing: 'site-suffix',
          separator: '~',
          operations: ['create', 'changes', 'sync', 'publish', 'revert', 'restore'],
          itemKinds: ['html', 'json', 'media', 'config'],
          branchScopedSource: true,
          branchScopedCollaboration: true,
        }), { status: 200 });
      }
      return new Response('{"id":"work"}', { status: 200 });
    };
    try {
      document.body.append(editor);
      history.replaceState(null, '', '#/guardorg/guardsite/page');
      installBranchHashGuard();
      history.replaceState(null, '', '#/guardorg/guardsite~work/page');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await new Promise((resolve) => { setTimeout(resolve, 30); });
      expect(window.location.hash).to.equal('#/guardorg/guardsite/page');
      expect(flushes).to.equal(1);
      expect(document.querySelector('[role="alert"]')?.textContent).to.include('persist failed');
      expect(editor.inert).to.equal(false);
    } finally {
      editor.remove();
      document.querySelector('[role="alert"]')?.remove();
      history.replaceState(null, '', originalUrl);
      window.fetch = originalFetch;
    }
  });
});
