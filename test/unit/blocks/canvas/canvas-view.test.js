import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { notifyCanvasEditorActive } = await import('../../../../blocks/canvas/canvas.js');

describe('canvas editor view visibility', () => {
  let doc;
  let wysiwyg;

  beforeEach(async () => {
    doc = document.createElement('ew-editor-doc');
    wysiwyg = document.createElement('ew-editor-wysiwyg');
    document.body.append(doc, wysiwyg);
    await Promise.all([doc.updateComplete, wysiwyg.updateComplete]);
  });

  afterEach(() => {
    doc.remove();
    wysiwyg.remove();
  });

  it('shows only the chosen editors for Layout, Content and Split', () => {
    notifyCanvasEditorActive('layout');
    expect(doc.hidden).to.be.true;
    expect(wysiwyg.hidden).to.be.false;

    notifyCanvasEditorActive('content');
    expect(doc.hidden).to.be.false;
    expect(wysiwyg.hidden).to.be.true;

    notifyCanvasEditorActive('split');
    expect(doc.hidden).to.be.false;
    expect(wysiwyg.hidden).to.be.false;
  });
});
