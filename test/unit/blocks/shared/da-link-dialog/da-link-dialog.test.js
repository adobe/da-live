import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((r) => { setTimeout(r, 0); });

describe('da-link-dialog', () => {
  let DaLinkDialog;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const mod = await import('../../../../../blocks/shared/da-link-dialog/da-link-dialog.js');
    DaLinkDialog = mod.default;
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
    expect(el.shadowRoot.querySelector('.link-dialog')).to.be.null;
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

  it('emits da-link-submit with href and text on form submit', async () => {
    await mount({ open: true });
    let detail = null;
    el.addEventListener('da-link-submit', (e) => { detail = e.detail; });

    const hrefInput = el.shadowRoot.querySelector('input[name="link-href"]');
    const textInput = el.shadowRoot.querySelector('input[name="link-text"]');
    hrefInput.value = 'https://test.com';
    textInput.value = 'Test';

    el.shadowRoot.querySelector('.link-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextFrame();

    expect(detail).to.deep.equal({ href: 'https://test.com', text: 'Test' });
  });

  it('emits da-link-cancel when Cancel button is clicked', async () => {
    await mount({ open: true });
    let cancelled = false;
    el.addEventListener('da-link-cancel', () => { cancelled = true; });
    el.shadowRoot.querySelector('.link-form-cancel').click();
    expect(cancelled).to.be.true;
  });

  it('emits da-link-cancel on Escape keydown in backdrop', async () => {
    await mount({ open: true });
    let cancelled = false;
    el.addEventListener('da-link-cancel', () => { cancelled = true; });
    const backdrop = el.shadowRoot.querySelector('.link-dialog');
    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).to.be.true;
  });

  it('emits da-link-cancel when backdrop is clicked directly', async () => {
    await mount({ open: true });
    let cancelled = false;
    el.addEventListener('da-link-cancel', () => { cancelled = true; });
    const backdrop = el.shadowRoot.querySelector('.link-dialog');
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: backdrop });
    Object.defineProperty(clickEvent, 'currentTarget', { value: backdrop });
    backdrop.dispatchEvent(clickEvent);
    expect(cancelled).to.be.true;
  });

  it('does not emit da-link-submit when href is empty', async () => {
    await mount({ open: true });
    let fired = false;
    el.addEventListener('da-link-submit', () => { fired = true; });
    // leave href input empty, submit the form
    el.shadowRoot.querySelector('.link-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextFrame();
    expect(fired).to.be.false;
  });

  it('focuses the URL input when opened', async () => {
    await mount({ open: false });
    el.open = true;
    await el.updateComplete;
    await nextFrame();
    await nextFrame(); // updateComplete.then() schedules one more microtask
    const hrefInput = el.shadowRoot.querySelector('input[name="link-href"]');
    expect(el.shadowRoot.activeElement).to.equal(hrefInput);
  });
});
