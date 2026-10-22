import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-canvas-header/ew-canvas-header.js');

function segmentByLabel(header, label) {
  return [...header.shadowRoot.querySelectorAll('.segment')]
    .find((b) => b.textContent.trim().startsWith(label)) ?? null;
}

describe('ew-canvas-header segments', () => {
  let header;

  beforeEach(async () => {
    header = document.createElement('ew-canvas-header');
    document.body.append(header);
    await header.updateComplete;
  });

  afterEach(() => {
    header.remove();
    canvasBus.editorSaveState.emit(null);
  });

  it('shows source-save state and emits retry requests only after a failure', async () => {
    expect(header.shadowRoot.querySelector('[role="status"]')).to.be.null;
    canvasBus.editorSaveState.emit({ status: 'saving' });
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]').textContent).to.include('Saving...');
    expect(header.shadowRoot.querySelector('[data-action="retry-save"]')).to.be.null;
    canvasBus.editorSaveState.emit({ status: 'error', error: 'Write denied' });
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]').title).to.equal('Write denied');
    let retries = 0;
    const off = canvasBus.editorSaveRequest.subscribe(() => { retries += 1; });
    header.shadowRoot.querySelector('[data-action="retry-save"]').click();
    off();
    expect(retries).to.equal(1);
    canvasBus.editorSaveState.emit(null);
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]')).to.be.null;
  });

  it('renders the Layout, Content and Split segments', async () => {
    header.editorView = 'layout';
    await header.updateComplete;
    expect(header.shadowRoot.querySelectorAll('.segment').length).to.equal(3);
    expect(segmentByLabel(header, 'Layout')).to.exist;
    expect(segmentByLabel(header, 'Content')).to.exist;
  });

  it('never renders a block segment (block editing is a modal now)', async () => {
    for (const view of ['layout', 'content', 'split']) {
      header.editorView = view;
      // eslint-disable-next-line no-await-in-loop
      await header.updateComplete;
      expect(header.shadowRoot.querySelector('.segment-block')).to.be.null;
    }
  });

  it('emits an editor-view request and updates editorView when a segment is clicked', async () => {
    header.editorView = 'layout';
    await header.updateComplete;
    let requestedView;
    const unsub = canvasBus.editorViewRequest.subscribe(({ view }) => { requestedView = view; });

    segmentByLabel(header, 'Content').click();
    unsub?.();

    expect(requestedView).to.equal('content');
    expect(header.editorView).to.equal('content');
  });
});
