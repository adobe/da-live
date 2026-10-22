import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

// Mock faceapi globally
window.faceapi = {
  nets: { tinyFaceDetector: { loadFromUri: async () => {} } },
  TinyFaceDetectorOptions: class {},
  detectSingleFace: async () => null,
};

describe('focalPointDialog', () => {
  let view;
  let node;
  let openFocalPointDialog;

  before(async () => {
    // Mock nx before importing dependencies
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const mod = await import('../../../../../../blocks/edit/prose/plugins/focalPointDialog.js');
    openFocalPointDialog = mod.openFocalPointDialog;
  });

  beforeEach(() => {
    node = {
      type: { name: 'image' },
      attrs: { src: 'test.jpg', dataFocalX: null, dataFocalY: null },
    };

    view = {
      dispatch: () => {},
      state: {
        doc: { nodeAt: () => node },
        // eslint-disable-next-line no-unused-vars
        tr: { setNodeMarkup: (pos, mark, attrs) => ({ attrs }) },
      },
    };
  });

  afterEach(() => {
    const dialog = document.querySelector('da-dialog');
    if (dialog) dialog.remove();
  });

  it('opens a dialog', async () => {
    await openFocalPointDialog(view, 10, node);
    const dialog = document.querySelector('da-dialog');
    expect(dialog).to.exist;
    expect(dialog.title).to.equal('Set Image Focal Point');
  });

  // it('renders image and indicator', async () => {
  //   await openFocalPointDialog(view, 10, node);
  //   const dialog = document.querySelector('da-dialog');

  //   const img = dialog.querySelector('.focal-point-image');
  //   const indicator = dialog.querySelector('.focal-point-indicator');

  //   expect(img).to.exist;
  //   expect(indicator).to.exist;
  // });

  it('only writes the focal point on Accept, not while dragging', async () => {
    const dispatched = [];
    view.dispatch = (tr) => { dispatched.push(tr); };

    await openFocalPointDialog(view, 10, node);
    const dialog = document.querySelector('da-dialog');
    const container = dialog.querySelector('.focal-point-image-container');
    const img = dialog.querySelector('.focal-point-image');

    // Mock rects for calculation
    img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });

    container.dispatchEvent(new MouseEvent('mousedown', { clientX: 25, clientY: 75, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(dispatched).to.have.length(0);

    dialog.action.click();
    expect(dispatched).to.have.length(1);
    expect(dispatched[0].attrs.dataFocalX).to.equal('25.00');
    expect(dispatched[0].attrs.dataFocalY).to.equal('75.00');
  });

  it('does not write anything on Cancel', async () => {
    const dispatched = [];
    view.dispatch = (tr) => { dispatched.push(tr); };

    await openFocalPointDialog(view, 10, node);
    const dialog = document.querySelector('da-dialog');
    const img = dialog.querySelector('.focal-point-image');
    img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    dialog.querySelector('.focal-point-image-container')
      .dispatchEvent(new MouseEvent('mousedown', { clientX: 25, clientY: 75, bubbles: true }));

    dialog.querySelector('sl-button.primary').click();
    expect(dispatched).to.have.length(0);
  });

  it('clears the focal point on Clear', async () => {
    const dispatched = [];
    view.dispatch = (tr) => { dispatched.push(tr); };
    node.attrs = { ...node.attrs, dataFocalX: '10.00', dataFocalY: '20.00' };

    await openFocalPointDialog(view, 10, node);
    document.querySelector('da-dialog sl-button.negative').click();
    expect(dispatched).to.have.length(1);
    expect(dispatched[0].attrs.dataFocalX).to.equal(null);
    expect(dispatched[0].attrs.dataFocalY).to.equal(null);
  });
});
