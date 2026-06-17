import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((r) => { setTimeout(r, 0); });

describe('da-link-dialog', () => {
  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/da-link-dialog/da-link-dialog.js');
  });

  let el;

  afterEach(() => {
    el?.remove();
    el = null;
  });

  async function mount(props = {}) {
    el = document.createElement('da-link-dialog');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    await nextFrame();
    return el;
  }

  it('is defined as a custom element', async () => {
    await mount();
    expect(customElements.get('da-link-dialog')).to.exist;
  });

  it('renders nothing when open is false (default)', async () => {
    await mount({ open: false });
    expect(el.shadowRoot.querySelector('nx-dialog')).to.be.null;
  });

  it('renders the form when open is true', async () => {
    await mount({ open: true });
    expect(el.shadowRoot.querySelector('.link-form')).to.exist;
    expect(el.shadowRoot.querySelector('input[name="link-href"]')).to.exist;
    expect(el.shadowRoot.querySelector('input[name="link-text"]')).to.exist;
  });

  it('pre-fills href and text inputs from properties', async () => {
    await mount({ open: true, href: 'https://example.com', text: 'Example' });
    const hrefInput = el.shadowRoot.querySelector('input[name="link-href"]');
    const textInput = el.shadowRoot.querySelector('input[name="link-text"]');
    expect(hrefInput.value).to.equal('https://example.com');
    expect(textInput.value).to.equal('Example');
  });

  it('emits da-link-submit with href and text when Save is clicked', async () => {
    await mount({ open: true });
    let detail = null;
    el.addEventListener('da-link-submit', (e) => { detail = e.detail; });

    el.shadowRoot.querySelector('input[name="link-href"]').value = 'https://test.com';
    el.shadowRoot.querySelector('input[name="link-text"]').value = 'Test';
    el.shadowRoot.querySelector('.link-form-save').click();
    await nextFrame();

    expect(detail).to.deep.equal({ href: 'https://test.com', text: 'Test' });
  });

  it('emits da-link-submit with a relative path', async () => {
    await mount({ open: true });
    let detail = null;
    el.addEventListener('da-link-submit', (e) => { detail = e.detail; });

    el.shadowRoot.querySelector('input[name="link-href"]').value = '/about';
    el.shadowRoot.querySelector('.link-form-save').click();
    await nextFrame();

    expect(detail).to.deep.equal({ href: '/about', text: '' });
  });

  it('does not emit da-link-submit for dangerous URL protocols', async () => {
    await mount({ open: true });
    let fired = false;
    el.addEventListener('da-link-submit', () => { fired = true; });

    for (const url of [`${'javascript'}:alert(1)`, 'data:text/html,x', 'vbscript:foo']) {
      el.shadowRoot.querySelector('input[name="link-href"]').value = url;
      el.shadowRoot.querySelector('.link-form-save').click();
      await nextFrame();
    }

    expect(fired).to.be.false;
  });

  it('emits da-link-cancel when Cancel button is clicked', async () => {
    await mount({ open: true });
    let cancelled = false;
    el.addEventListener('da-link-cancel', () => { cancelled = true; });
    el.shadowRoot.querySelector('.link-form-cancel').click();
    expect(cancelled).to.be.true;
  });

  it('emits da-link-cancel when nx-dialog emits a close event', async () => {
    await mount({ open: true });
    let cancelled = false;
    el.addEventListener('da-link-cancel', () => { cancelled = true; });
    el.shadowRoot.querySelector('nx-dialog').dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    expect(cancelled).to.be.true;
  });
});
