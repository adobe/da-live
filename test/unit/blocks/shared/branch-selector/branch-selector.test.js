import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/shared/branch-selector/branch-selector.js';

describe('content branch selector', () => {
  let fetchBefore;
  let selector;
  beforeEach(() => {
    fetchBefore = window.fetch;
    selector = document.createElement('da-branch-selector');
    selector.org = 'selectororg';
    selector.site = 'selectorsite~work';
  });
  afterEach(() => {
    selector.remove();
    window.fetch = fetchBefore;
  });

  it('shows the selected branch and an extension slot only after capability discovery', async () => {
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
      const body = { defaultBranchId: 'main', branches: [{ id: 'work', name: 'work' }] };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    document.body.append(selector);
    await selector.load();
    await selector.updateComplete;
    expect(selector.shadowRoot.textContent).to.include('Branch · work');
    expect(selector.shadowRoot.textContent).to.include('Create from Default');
    const trigger = selector.shadowRoot.querySelector('.branch-trigger');
    const menu = selector.shadowRoot.querySelector('[popover]');
    expect(trigger.getAttribute('popovertarget')).to.equal(menu.id);
    expect(menu.matches(':popover-open')).to.equal(false);
    expect(menu.querySelector('[aria-current]').textContent.trim()).to.equal('Branch · work');
    const changes = selector.shadowRoot.querySelector('da-branch-changes');
    expect(changes.branchId).to.equal('work');
    expect(changes.client).to.equal(selector._data.client);
    expect(selector.shadowRoot.querySelector('slot[name="toolbar"]')).to.exist;
    const conflicts = selector.shadowRoot.querySelector('da-branch-conflicts');
    await Promise.all([changes.updateComplete, conflicts.updateComplete]);
    const actions = [changes, conflicts].flatMap((element) => [
      ...element.shadowRoot.querySelectorAll('button[part~="action"]'),
    ]);
    expect(actions).to.have.length(3);
    actions.forEach((action) => expect(getComputedStyle(action).minHeight).to.equal('32px'));
  });

  it('coalesces an explicit load with the initial Lit update', async () => {
    selector.org = 'coalescedorg';
    let release;
    let started;
    const waiting = new Promise((resolve) => { started = resolve; });
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
        }));
      }
      return new Promise((resolve) => {
        release = resolve;
        started();
      });
    };
    const first = selector.load();
    document.body.append(selector);
    await selector.updateComplete;
    await waiting;
    expect(selector.load()).to.equal(first);
    release(new Response(JSON.stringify({ defaultBranchId: 'main', branches: [{ id: 'work', name: 'work' }] })));
    await first;
    expect(selector._data.selected).to.equal('work');
  });

  it('hides itself when capability discovery is unsupported', async () => {
    selector.org = 'unsupportedorg';
    window.fetch = async () => new Response('{"supported":false}', { status: 200 });
    document.body.append(selector);
    await selector.load();
    await selector.updateComplete;
    expect(selector.shadowRoot.querySelector('.branch-trigger')).to.equal(null);
  });

  it('does not show branch actions on default', async () => {
    selector.org = 'defaultorg';
    selector.site = 'selectorsite';
    document.body.append(selector);
    await selector.updateComplete;
    selector._data = { selected: null, branches: [], defaultBranchId: 'main' };
    await selector.updateComplete;
    expect(selector.shadowRoot.querySelector('da-branch-changes')).to.equal(null);
    expect(selector.shadowRoot.querySelector('da-branch-conflicts')).to.equal(null);
    expect(selector.shadowRoot.querySelector('slot[name="toolbar"]')).to.equal(null);
  });
});
