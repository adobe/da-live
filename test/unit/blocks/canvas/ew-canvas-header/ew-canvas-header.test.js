import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-canvas-header/ew-canvas-header.js');

function segmentByLabel(header, label) {
  return [...header.shadowRoot.querySelectorAll('.segment')]
    .find((b) => b.textContent.trim().startsWith(label)) ?? null;
}

function blockSegment(header) {
  return header.shadowRoot.querySelector('.segment-block');
}

describe('ew-canvas-header block segment', () => {
  let header;

  beforeEach(async () => {
    header = document.createElement('ew-canvas-header');
    document.body.append(header);
    await header.updateComplete;
  });

  afterEach(() => header.remove());

  it('does not render the Block segment outside block mode', async () => {
    header.editorView = 'layout';
    await header.updateComplete;
    expect(blockSegment(header)).to.be.null;

    header.editorView = 'split';
    await header.updateComplete;
    expect(blockSegment(header)).to.be.null;
  });

  it('renders the Block segment (with a close affordance) as selected in block mode', async () => {
    header.editorView = 'block';
    await header.updateComplete;
    const seg = blockSegment(header);
    expect(seg).to.exist;
    expect(seg.classList.contains('is-selected')).to.be.true;
    expect(seg.querySelector('.segment-close')).to.exist;
  });

  it('hides the Content and Split segments in block mode', async () => {
    header.editorView = 'block';
    await header.updateComplete;
    expect(segmentByLabel(header, 'Content')).to.be.null;
    expect(segmentByLabel(header, 'Layout')).to.exist;
  });

  it('closes back to layout and emits the view-change event when the block segment is clicked', async () => {
    header.editorView = 'block';
    await header.updateComplete;
    let detailView;
    header.addEventListener('nx-canvas-editor-view', (e) => { detailView = e.detail.view; });

    blockSegment(header).click();

    expect(detailView).to.equal('layout');
    expect(header.editorView).to.equal('layout');
  });

  it('accepts block via the public setEditorView method', async () => {
    header.editorView = 'layout';
    await header.updateComplete;
    let detailView;
    header.addEventListener('nx-canvas-editor-view', (e) => { detailView = e.detail.view; });

    header.setEditorView('block');

    expect(detailView).to.equal('block');
    expect(header.editorView).to.equal('block');
  });
});
