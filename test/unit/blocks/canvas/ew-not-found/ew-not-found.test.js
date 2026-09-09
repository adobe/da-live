/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: showEwNotFoundDialog, libraryHashFromPath } = await import('../../../../../blocks/canvas/ew-not-found/ew-not-found.js');

// da-dialog calls showModal() via a 20ms setTimeout in connectedCallback.
const waitForDialog = () => new Promise((r) => { setTimeout(r, 50); });

describe('libraryHashFromPath', () => {
  it('reduces a document path to its site root', () => {
    expect(libraryHashFromPath('org/site/folder/my-doc')).to.equal('#/org/site');
  });

  it('handles a top-level document', () => {
    expect(libraryHashFromPath('org/site/my-doc')).to.equal('#/org/site');
  });

  it('falls back to the root hash when there is no org/site', () => {
    expect(libraryHashFromPath('')).to.equal('#/');
    expect(libraryHashFromPath('org')).to.equal('#/');
  });
});

describe('showEwNotFoundDialog', () => {
  afterEach(() => {
    document.querySelectorAll('da-dialog').forEach((d) => d.remove());
  });

  it('resolves "create" when the action button is clicked', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    const actionBtn = dialog.shadowRoot.querySelector('.da-dialog-footer sl-button');
    actionBtn.click();

    expect(await promise).to.equal('create');
  });

  it('resolves "cancel" when the cancel button is clicked', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    const cancelBtn = dialog.querySelector('sl-button[slot="footer-left"]');
    expect(cancelBtn.textContent).to.equal('Cancel');
    cancelBtn.click();

    expect(await promise).to.equal('cancel');
  });

  it('names the missing document in the message', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    expect(dialog.textContent).to.include('my-doc');

    dialog.querySelector('sl-button[slot="footer-left"]').click();
    await promise;
  });

  it('resolves "cancel" when the dialog is closed without a button action', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();

    document.querySelector('da-dialog').close();

    expect(await promise).to.equal('cancel');
  });

  it('closes the dialog and resolves "hashchange" on hashchange', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();
    expect(document.querySelector('da-dialog')).to.exist;

    window.dispatchEvent(new Event('hashchange'));

    expect(await promise).to.equal('hashchange');
  });
});
