import { expect } from '@esm-bundle/chai';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { whenCanvasBranch } from '../../../../../blocks/canvas/utils/branch.js';

describe('whenCanvasBranch', () => {
  const state = { org: 'org', site: 'site', path: '/org/site/a' };
  const page = { org: 'org', site: 'site', path: 'a' };

  afterEach(() => canvasBus.branchState.emit({ path: null, status: 'pending' }));

  it('resolves the ready branch of the page as a hostname label', async () => {
    canvasBus.branchState.emit({ ...state, status: 'ready', branch: 'Feat/One' });
    expect(await whenCanvasBranch(page)).to.equal('feat-one');
  });

  it('waits for a pending branch to resolve instead of failing', async () => {
    canvasBus.branchState.emit({ ...state, status: 'pending' });
    const resolving = whenCanvasBranch(page);
    canvasBus.branchState.emit({ ...state, status: 'ready', branch: 'Feat/One' });
    expect(await resolving).to.equal('feat-one');
  });

  it('ignores the previous page branch while the new page resolves', async () => {
    canvasBus.branchState.emit({ ...state, path: '/org/site/b', status: 'ready', branch: 'old' });
    const resolving = whenCanvasBranch(page);
    canvasBus.branchState.emit({ ...state, status: 'pending' });
    canvasBus.branchState.emit({ ...state, status: 'ready', branch: 'Feat/One' });
    expect(await resolving).to.equal('feat-one');
  });

  it('resolves no branch instead of guessing one when resolution fails', async () => {
    canvasBus.branchState.emit({ ...state, status: 'error', error: 'down' });
    expect(await whenCanvasBranch(page)).to.equal(undefined);
  });
});
