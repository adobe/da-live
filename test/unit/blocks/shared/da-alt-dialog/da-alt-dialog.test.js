import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((r) => { setTimeout(r, 0); });

describe('da-alt-dialog', () => {
  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/da-alt-dialog/da-alt-dialog.js');
  });

  let el;

  afterEach(() => {
    el?.remove();
    el = null;
  });

  async function mount(props = {}) {
    el = document.createElement('da-alt-dialog');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    await nextFrame();
    return el;
  }

  it('is defined as a custom element', async () => {
    await mount();
    expect(customElements.get('da-alt-dialog')).to.exist;
  });

  it('renders nothing when open is false (default)', async () => {
    await mount({ open: false });
    expect(el.shadowRoot.querySelector('nx-dialog')).to.be.null;
  });

  it('renders the form when open is true', async () => {
    await mount({ open: true });
    expect(el.shadowRoot.querySelector('.alt-form')).to.exist;
    expect(el.shadowRoot.querySelector('input[name="alt-text"]')).to.exist;
  });

  it('pre-fills alt input from property', async () => {
    await mount({ open: true, alt: 'A red square' });
    const input = el.shadowRoot.querySelector('input[name="alt-text"]');
    expect(input.value).to.equal('A red square');
  });

  it('emits da-alt-submit with trimmed alt when Save is clicked', async () => {
    await mount({ open: true });
    let detail = null;
    el.addEventListener('da-alt-submit', (e) => { detail = e.detail; });

    el.shadowRoot.querySelector('input[name="alt-text"]').value = '  My image  ';
    el.shadowRoot.querySelector('.alt-form-save').click();
    await nextFrame();

    expect(detail).to.deep.equal({ alt: 'My image' });
  });

  it('emits da-alt-submit with an empty string when input is blank', async () => {
    await mount({ open: true, alt: '' });
    let detail = null;
    el.addEventListener('da-alt-submit', (e) => { detail = e.detail; });

    el.shadowRoot.querySelector('.alt-form-save').click();
    await nextFrame();

    expect(detail).to.deep.equal({ alt: '' });
  });

  it('emits da-alt-cancel when Cancel button is clicked', async () => {
    await mount({ open: true });
    let cancelled = false;
    el.addEventListener('da-alt-cancel', () => { cancelled = true; });
    el.shadowRoot.querySelector('.alt-form-cancel').click();
    expect(cancelled).to.be.true;
  });

  it('emits da-alt-cancel when nx-dialog emits a close event', async () => {
    await mount({ open: true });
    let cancelled = false;
    el.addEventListener('da-alt-cancel', () => { cancelled = true; });
    el.shadowRoot.querySelector('nx-dialog').dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    expect(cancelled).to.be.true;
  });
});
