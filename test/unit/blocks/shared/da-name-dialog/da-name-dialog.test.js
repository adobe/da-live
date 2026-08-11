import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((r) => { setTimeout(r, 0); });

describe('da-name-dialog', () => {
  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/da-name-dialog/da-name-dialog.js');
  });

  let el;

  afterEach(() => {
    el?.remove();
    el = null;
  });

  async function mount(props = {}) {
    el = document.createElement('da-name-dialog');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    await nextFrame();
    return el;
  }

  it('is defined as a custom element', async () => {
    await mount();
    expect(customElements.get('da-name-dialog')).to.exist;
  });

  it('renders nothing when open is false (default)', async () => {
    await mount({ open: false });
    expect(el.shadowRoot.querySelector('nx-dialog')).to.be.null;
  });

  it('renders the name field when open is true', async () => {
    await mount({ open: true, title: 'New page in a', placeholder: 'page name' });
    const input = el.shadowRoot.querySelector('.da-input');
    expect(input).to.exist;
    expect(input.placeholder).to.equal('page name');
    expect(el.shadowRoot.querySelector('nx-dialog').getAttribute('title')).to.equal('New page in a');
  });

  it('sanitizes the name as the user types', async () => {
    await mount({ open: true });
    const input = el.shadowRoot.querySelector('.da-input');
    input.value = 'My New Page';
    input.dispatchEvent(new Event('input'));
    expect(input.value).to.equal('my-new-page');
  });

  it('emits da-name-submit with the sanitized, trimmed name when Create is clicked', async () => {
    await mount({ open: true });
    let detail = null;
    el.addEventListener('da-name-submit', (e) => { detail = e.detail; });

    el.shadowRoot.querySelector('.da-input').value = 'My New Page-';
    el.shadowRoot.querySelector('.da-btn-primary').click();
    await nextFrame();

    expect(detail).to.deep.equal({ name: 'my-new-page' });
  });

  it('emits da-name-submit on Enter in the input', async () => {
    await mount({ open: true });
    let detail = null;
    el.addEventListener('da-name-submit', (e) => { detail = e.detail; });

    const input = el.shadowRoot.querySelector('.da-input');
    input.value = 'my-page';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await nextFrame();

    expect(detail).to.deep.equal({ name: 'my-page' });
  });

  it('shows an inline error and does not emit da-name-submit when the name is empty', async () => {
    await mount({ open: true });
    let fired = false;
    el.addEventListener('da-name-submit', () => { fired = true; });

    el.shadowRoot.querySelector('.da-btn-primary').click();
    await el.updateComplete;

    expect(fired).to.be.false;
    expect(el._nameError).to.be.true;
    expect(el.shadowRoot.querySelector('.da-input-error-msg').textContent.trim()).to.equal('Please fill out this field.');
  });

  it('clears the name error when the input changes', async () => {
    await mount({ open: true });
    el.shadowRoot.querySelector('.da-btn-primary').click();
    await el.updateComplete;
    expect(el._nameError).to.be.true;

    el.shadowRoot.querySelector('.da-input').dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(el._nameError).to.be.false;
  });

  it('shows the host-supplied error message', async () => {
    await mount({ open: true, error: 'Could not create the page. Try a different name.' });
    expect(el.shadowRoot.querySelector('.da-input-error-msg').textContent.trim())
      .to.equal('Could not create the page. Try a different name.');
  });

  it('disables the Create button while saving', async () => {
    await mount({ open: true, saving: true });
    expect(el.shadowRoot.querySelector('.da-btn-primary').disabled).to.be.true;
  });

  it('emits close when Cancel is clicked', async () => {
    await mount({ open: true });
    let cancelled = false;
    el.addEventListener('close', () => { cancelled = true; });
    el.shadowRoot.querySelector('.da-btn-secondary').click();
    await nextFrame();
    expect(cancelled).to.be.true;
  });

  it('clears the name error when the dialog closes', async () => {
    await mount({ open: true });
    el.shadowRoot.querySelector('.da-btn-primary').click();
    await el.updateComplete;
    expect(el._nameError).to.be.true;

    el.shadowRoot.querySelector('nx-dialog').dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el._nameError).to.be.false;
  });
});
