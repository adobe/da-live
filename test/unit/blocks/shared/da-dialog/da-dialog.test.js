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

  it('applies emphasis class when set', async () => {
    el = await fixture('<da-dialog emphasis="quiet"></da-dialog>');
    await nextFrame();
    const inner = el.shadowRoot.querySelector('.da-dialog-inner');
    expect(inner.classList.contains('da-dialog-quiet')).to.be.true;
  });

  it('renders the title in the header', async () => {
    el = await fixture('<da-dialog title="Hello"></da-dialog>');
    await nextFrame();
    const heading = el.shadowRoot.querySelector('.da-dialog-header p');
    expect(heading.textContent.trim()).to.equal('Hello');
  });

  it('does not render footer when no action is set', async () => {
    el = await fixture('<da-dialog></da-dialog>');
    await nextFrame();
    expect(el.shadowRoot.querySelector('.da-dialog-footer')).to.equal(null);
  });

  it('renders footer when an action is provided and dispatches click', async () => {
    el = await fixture('<da-dialog></da-dialog>');
    await nextFrame();
    let clicked = 0;
    el.action = { label: 'OK', style: 'primary', click: () => { clicked += 1; } };
    el.message = 'A message';
    await el.updateComplete;
    const footer = el.shadowRoot.querySelector('.da-dialog-footer');
    expect(footer).to.exist;
    expect(footer.textContent).to.contain('A message');
    const button = el.shadowRoot.querySelector('sl-button');
    expect(button).to.exist;
    button.click();
    expect(clicked).to.equal(1);
  });

  it('respects disabled flag on the action button', async () => {
    el = await fixture('<da-dialog></da-dialog>');
    await nextFrame();
    el.action = { label: 'OK', style: 'primary', click: () => {}, disabled: true };
    await el.updateComplete;
    const button = el.shadowRoot.querySelector('sl-button');
    expect(button.hasAttribute('disabled')).to.be.true;
  });

  it('triggers a deferred showModal once the dialog mounts', async () => {
    el = await fixture('<da-dialog></da-dialog>');
    // Force fall-through to lazy path by clearing internal _dialog reference path:
    // call showModal before any sl-dialog has rendered (re-call is harmless).
    el._showLazyModal = true;
    await el.requestUpdate();
    await el.updateComplete;
    expect(el._showLazyModal).to.equal(undefined);
  });
});
