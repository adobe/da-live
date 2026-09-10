/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: showEwNotFoundDialog, libraryHashFromPath } = await import('../../../../../blocks/canvas/utils/ew-not-found.js');

// The component renders nx-dialog on its first update; wait a frame for it.
const waitForDialog = () => new Promise((r) => { setTimeout(r, 50); });
const getEl = () => document.querySelector('ew-not-found');
const getAction = (label) => [...getEl().shadowRoot.querySelectorAll('button[slot="actions"]')]
  .find((b) => b.textContent.trim() === label);

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
    document.querySelectorAll('ew-not-found').forEach((d) => d.remove());
  });

  it('resolves "create" when the Create document button is clicked', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();

    getAction('Create document').click();

    expect(await promise).to.equal('create');
  });

  it('resolves "cancel" when the Cancel button is clicked', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();

    getAction('Cancel').click();

    expect(await promise).to.equal('cancel');
  });

  it('names the missing document in the message', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();

    expect(getEl().shadowRoot.textContent).to.include('my-doc');

    getAction('Cancel').click();
    await promise;
  });

  it('resolves "cancel" when the dialog is closed without a button action', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();

    getEl().shadowRoot.querySelector('nx-dialog').close();

    expect(await promise).to.equal('cancel');
  });

  it('closes the dialog and resolves "hashchange" on hashchange', async () => {
    const promise = showEwNotFoundDialog({ name: 'my-doc' });
    await waitForDialog();
    expect(getEl()).to.exist;

    window.dispatchEvent(new Event('hashchange'));

    expect(await promise).to.equal('hashchange');
  });
});
