import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
let installComparison;
before(async () => {
  ({ installComparison } = await import('../../../../blocks/canvas/ew-comparison/comparison.js'));
});

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('Comparison did not settle.');
}

describe('fire-and-forget comparison commands', () => {
  const context = { org: 'example', site: 'site', path: 'page' };
  let root;
  let controller;
  let errors;
  let saveCalls;
  let fail;
  const rejection = (event) => {
    errors.push(event.reason);
    event.preventDefault();
  };
  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    errors = [];
    saveCalls = 0;
    fail = false;
    window.addEventListener('unhandledrejection', rejection);
    controller = installComparison({
      mountRoot: root,
      getContext: () => context,
      getDocument: () => '<p>Current read-only content</p>',
      saveDocument: async () => { saveCalls += 1; return { ok: false, error: 'not-writable' }; },
      loadContent: async () => {
        if (fail) throw new Error('Delivery read failed');
        return { html: '<p>Live content</p>' };
      },
    });
  });
  afterEach(() => {
    controller.destroy();
    root.remove();
    window.removeEventListener('unhandledrejection', rejection);
  });

  it('opens and closes without callbacks or saving the document', async () => {
    canvasBus.comparisonRequest.emit({ action: 'openComparison', details: { candidate: 'document', baseline: 'live' }, context });
    await waitFor(() => root.querySelector('ew-comparison')?.loading === false);
    canvasBus.comparisonRequest.emit({ action: 'closeComparison', context });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(root.querySelector('ew-comparison')).to.equal(null);
    expect(saveCalls).to.equal(0);
    expect(errors).to.deep.equal([]);
  });

  it('shows delivery failures in the host surface without a caller response', async () => {
    fail = true;
    canvasBus.comparisonRequest.emit({ action: 'openComparison', details: { candidate: 'preview', baseline: 'live' }, context });
    await waitFor(() => root.querySelector('ew-comparison')?.loading === false);
    const surface = root.querySelector('ew-comparison');
    await surface.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(surface.shadowRoot.textContent).to.include('Delivery read failed');
    expect(saveCalls).to.equal(0);
    expect(errors).to.deep.equal([]);
  });

  it('ignores stale page commands without saving or leaking a rejection', async () => {
    canvasBus.comparisonRequest.emit({ action: 'openComparison', details: { candidate: 'document', baseline: 'live' }, context: { ...context, path: 'old-page' } });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(root.querySelector('ew-comparison')).to.equal(null);
    expect(saveCalls).to.equal(0);
    expect(errors).to.deep.equal([]);
  });
});
