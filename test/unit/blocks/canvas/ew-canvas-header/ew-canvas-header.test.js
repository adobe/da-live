import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-canvas-header/ew-canvas-header.js');

function segmentByLabel(header, label) {
  return [...header.shadowRoot.querySelectorAll('.segment')]
    .find((b) => b.textContent.trim() === label) ?? null;
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
    expect(segmentByLabel(header, 'Block')).to.be.null;

    header.editorView = 'split';
    await header.updateComplete;
    expect(segmentByLabel(header, 'Block')).to.be.null;
  });

  it('renders the Block segment as selected in block mode', async () => {
    header.editorView = 'block';
    await header.updateComplete;
    const seg = segmentByLabel(header, 'Block');
    expect(seg).to.exist;
    expect(seg.classList.contains('is-selected')).to.be.true;
  });

  it('toggles back to layout and emits the view-change event when clicked', async () => {
    header.editorView = 'block';
    await header.updateComplete;
    let detailView;
    header.addEventListener('nx-canvas-editor-view', (e) => { detailView = e.detail.view; });

    segmentByLabel(header, 'Block').click();

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
