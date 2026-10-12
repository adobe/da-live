import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

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

  beforeEach(async () => {
    header = document.createElement('ew-canvas-header');
    document.body.append(header);
    await header.updateComplete;
  });

  afterEach(() => header.remove());

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
