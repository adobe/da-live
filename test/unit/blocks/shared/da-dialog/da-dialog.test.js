import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

// Helper to wait for element updates
const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('da-dialog', () => {
  // eslint-disable-next-line no-unused-vars
  let DaDialog;

  before(async () => {
    // Mock nx before importing the component
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    try {
      const mod = await import('../../../../../blocks/shared/da-dialog/da-dialog.js');
      DaDialog = mod.default;
    } catch (e) {
      console.error('Error importing da-dialog:', e);
      throw e;
    }
  });

  let el;

  async function fixture(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString;
    const element = div.firstElementChild;
    document.body.appendChild(element);
    await nextFrame();
    return element;
  }

  afterEach(() => {
    if (el && el.parentElement) {
      el.remove();
    }
    el = null;
  });

  it('is defined', async () => {
    el = await fixture('<da-dialog></da-dialog>');
    expect(el).to.be.instanceOf(customElements.get('da-dialog'));
  });

  it('renders with default properties', async () => {
    el = await fixture('<da-dialog></da-dialog>');
    // Wait for showModal timeout (which is 20ms in component)
    await new Promise((r) => { setTimeout(r, 50); });

    expect(el.shadowRoot.querySelector('.da-dialog-inner')).to.exist;
    expect(el.shadowRoot.querySelector('sl-dialog')).to.exist;
  });

  it('applies size class', async () => {
    el = await fixture('<da-dialog size="large"></da-dialog>');
    await nextFrame();
    const inner = el.shadowRoot.querySelector('.da-dialog-inner');
    expect(inner.classList.contains('da-dialog-large')).to.be.true;
  });

  it('closes when close button is clicked', async () => {
    el = await fixture('<da-dialog></da-dialog>');
    await nextFrame();

    let closed = false;
    el.addEventListener('close', () => { closed = true; });

    const closeBtn = el.shadowRoot.querySelector('.da-dialog-close-btn');
    closeBtn.click();

    expect(closed).to.be.true;
  });

  it('handles dragging', async () => {
    el = await fixture('<da-dialog></da-dialog>');
    await nextFrame();

    const header = el.shadowRoot.querySelector('.da-dialog-header');

    // Mock native dialog
    const mockNativeDialog = document.createElement('div');
    // Override _getNativeDialog to return our mock
    // eslint-disable-next-line no-underscore-dangle
    el._getNativeDialog = () => mockNativeDialog;

    // Start drag
    header.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));

    // Move
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 150 }));

    // eslint-disable-next-line no-underscore-dangle
    expect(el._currentTransform.x).to.equal(50);
    // eslint-disable-next-line no-underscore-dangle
    expect(el._currentTransform.y).to.equal(50);
    expect(mockNativeDialog.style.transform).to.equal('translate(50px, 50px)');

    // Stop drag
    document.dispatchEvent(new MouseEvent('mouseup'));

    // Verify dragging stopped
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }));
    // eslint-disable-next-line no-underscore-dangle
    expect(el._currentTransform.x).to.equal(50); // Should stay same
  });
});
