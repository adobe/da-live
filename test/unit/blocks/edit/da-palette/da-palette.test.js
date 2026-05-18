/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('da-palette', () => {
  before(async () => {
    const savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
    try {
      await import('../../../../../blocks/edit/da-palette/da-palette.js');
    } finally {
      window.fetch = savedFetch;
    }
  });

  async function fixture(opts = {}) {
    const palette = document.createElement('da-palette');
    palette.title = opts.title || 'Title';
    palette.fields = opts.fields || { url: { label: 'URL', placeholder: 'https://', value: '' } };
    palette.callback = opts.callback || (() => {});
    palette.saveOnClose = opts.saveOnClose || false;
    palette.useLabelsAbove = opts.useLabelsAbove || false;
    document.body.appendChild(palette);
    await nextFrame();
    return palette;
  }

  it('Renders inputs and a title', async () => {
    const palette = await fixture({ title: 'Insert link' });
    expect(palette.shadowRoot.querySelector('h5').textContent).to.equal('Insert link');
    expect(palette.shadowRoot.querySelector('input')).to.exist;
    palette.remove();
  });

  it('Updates field values via inputChange', async () => {
    const palette = await fixture({ fields: { url: { label: 'URL', value: '' } } });
    palette.inputChange({ target: { value: 'https://x' } }, 'url');
    expect(palette.fields.url.value).to.equal('https://x');
    palette.remove();
  });

  it('Renders labels above inputs when useLabelsAbove is true', async () => {
    const palette = await fixture({
      useLabelsAbove: true,
      fields: { url: { label: 'My label', value: '' } },
    });
    expect(palette.shadowRoot.querySelector('label')).to.exist;
    expect(palette.shadowRoot.querySelector('label').textContent).to.equal('My label');
    palette.remove();
  });

  it('submit() invokes the callback with non-empty fields and removes the palette', async () => {
    let received;
    const palette = await fixture({
      fields: { url: { label: 'URL', value: 'https://x' }, alt: { label: 'Alt', value: '' } },
      callback: (params) => { received = params; },
    });
    palette.submit();
    expect(received).to.deep.equal({ url: 'https://x' });
    expect(palette.parentElement).to.equal(null);
  });

  it('internalClose dispatches a "closed" event and removes the element', async () => {
    const palette = await fixture();
    let closed = false;
    palette.addEventListener('closed', () => { closed = true; });
    palette.internalClose();
    expect(closed).to.be.true;
    expect(palette.parentElement).to.equal(null);
  });

  it('close() with saveOnClose triggers submit()', async () => {
    let received;
    const palette = await fixture({
      saveOnClose: true,
      callback: (params) => { received = params; },
      fields: { url: { label: 'URL', value: 'https://x' } },
    });
    palette.close({ preventDefault: () => {} });
    expect(received).to.deep.equal({ url: 'https://x' });
  });

  it('updateSelection routes to internalClose when saveOnClose is false', async () => {
    const palette = await fixture();
    let closed = false;
    palette.addEventListener('closed', () => { closed = true; });
    palette.updateSelection();
    expect(closed).to.be.true;
  });

  it('updateSelection routes to submit when saveOnClose is true', async () => {
    let received;
    const palette = await fixture({
      saveOnClose: true,
      callback: (params) => { received = params; },
      fields: { url: { label: 'URL', value: 'https://x' } },
    });
    palette.updateSelection();
    expect(received).to.deep.equal({ url: 'https://x' });
  });

  it('handleKeyDown(Enter) submits and Escape closes', async () => {
    let received;
    let closed = 0;
    const palette = await fixture({
      callback: (params) => { received = params; },
      fields: { url: { label: 'URL', value: 'a' } },
    });
    palette.addEventListener('closed', () => { closed += 1; });
    palette.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
    expect(received).to.deep.equal({ url: 'a' });
    // submit also triggers internalClose
    expect(closed).to.equal(1);
    // re-mount and test escape
    const palette2 = await fixture();
    palette2.addEventListener('closed', () => { closed += 1; });
    palette2.handleKeyDown({ key: 'Escape', preventDefault: () => {} });
    expect(closed).to.equal(2);
  });

  it('isOpen returns isConnected status', async () => {
    const palette = await fixture();
    expect(palette.isOpen()).to.be.true;
    palette.remove();
    expect(palette.isOpen()).to.be.false;
  });
});
