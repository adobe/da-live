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
});
