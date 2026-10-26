import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { setUISize } from '../../../../fixtures/nx2/utils/ui-size.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-canvas-header/ew-canvas-header.js');

function segmentedBtn(header) {
  return header.shadowRoot.querySelector('nx-segmented-btn');
}

async function segments(header) {
  const el = segmentedBtn(header);
  await el.updateComplete;
  return [...el.shadowRoot.querySelectorAll('.segment')];
}

async function segmentByLabel(header, label) {
  return (await segments(header))
    .find((b) => b.textContent.trim().startsWith(label)) ?? null;
}

describe('ew-canvas-header segments', () => {
  let header;
  let originalSize;
  let originalClasses;

  beforeEach(async () => {
    originalSize = localStorage.getItem('ui-size');
    originalClasses = document.body.className;
    setUISize({ size: 's' });
    header = document.createElement('ew-canvas-header');
    document.body.append(header);
    await header.updateComplete;
  });

  afterEach(() => {
    header.remove();
    if (originalSize === null) localStorage.removeItem('ui-size');
    else localStorage.setItem('ui-size', originalSize);
    document.body.className = originalClasses;
  });

  it('updates host, buttons, and segments live without resetting editor state', async () => {
    header.editorView = 'content';
    header.undoAvailable = true;
    await header.updateComplete;
    const control = segmentedBtn(header);
    const undo = header.shadowRoot.querySelector('[data-action="undo"]');
    expect(undo.classList.contains('nx-btn-lg')).to.be.false;
    setUISize({ size: 'm' });
    await header.updateComplete;
    await control.updateComplete;
    expect(header.dataset.uiSize).to.equal('m');
    expect(control.getAttribute('size')).to.equal('m');
    expect(undo.classList.contains('nx-btn-lg')).to.be.true;
    expect(header.editorView).to.equal('content');
    expect(header.undoAvailable).to.be.true;
    expect(segmentedBtn(header)).to.equal(control);
    setUISize({ size: 's' });
    await header.updateComplete;
    expect(header.dataset.uiSize).to.equal('s');
    expect(control.getAttribute('size')).to.equal('s');
    expect(undo.classList.contains('nx-btn-lg')).to.be.false;
    expect(header.editorView).to.equal('content');
  });

  it('renders the Layout, Content and Split segments', async () => {
    header.editorView = 'layout';
    await header.updateComplete;
    expect((await segments(header)).length).to.equal(3);
    expect(await segmentByLabel(header, 'Layout')).to.exist;
    expect(await segmentByLabel(header, 'Content')).to.exist;
  });

  it('never renders a block segment (block editing is a modal now)', async () => {
    for (const view of ['layout', 'content', 'split']) {
      header.editorView = view;
      // eslint-disable-next-line no-await-in-loop
      await header.updateComplete;
      // eslint-disable-next-line no-await-in-loop
      const el = segmentedBtn(header);
      // eslint-disable-next-line no-await-in-loop
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('.segment-block')).to.be.null;
    }
  });

  it('emits an editor-view request and updates editorView when a segment is clicked', async () => {
    header.editorView = 'layout';
    await header.updateComplete;
    let requestedView;
    const unsub = canvasBus.editorViewRequest.subscribe(({ view }) => { requestedView = view; });

    (await segmentByLabel(header, 'Content')).click();
    unsub?.();

    expect(requestedView).to.equal('content');
    expect(header.editorView).to.equal('content');
  });
});
