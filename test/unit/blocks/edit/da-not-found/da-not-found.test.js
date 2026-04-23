/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: showNotFoundDialog } = await import('../../../../../blocks/edit/da-not-found/da-not-found.js');

// da-dialog calls showModal() via a 20ms setTimeout in connectedCallback.
const waitForDialog = () => new Promise((r) => { setTimeout(r, 50); });

describe('showNotFoundDialog', () => {
  let savedFetch;
  let fetchCalls;

  const details = {
    fullpath: '/org/repo/some/missing-doc.html',
    name: 'missing-doc',
    parent: '/org/repo/some',
  };

  function mockFetch(listResponse) {
    window.fetch = async (url) => {
      fetchCalls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => listResponse,
        headers: { get: () => null },
      };
    };
  }

  beforeEach(() => {
    fetchCalls = [];
    savedFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = savedFetch;
    document.querySelectorAll('da-dialog').forEach((d) => d.remove());
  });

  it('resolves "create" when the action button is clicked', async () => {
    mockFetch([]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    // Action (rightmost) button is rendered in da-dialog's shadow DOM.
    const actionBtn = dialog.shadowRoot.querySelector('.da-dialog-footer sl-button');
    actionBtn.click();

    expect(await promise).to.equal('create');
  });

  it('resolves "cancel" when the cancel button is clicked', async () => {
    mockFetch([]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    const cancelBtn = dialog.querySelector('sl-button[slot="footer-left"]');
    expect(cancelBtn.textContent).to.equal('Cancel');
    cancelBtn.click();

    expect(await promise).to.equal('cancel');
  });

  it('omits the "Open folder" button when no folder exists', async () => {
    mockFetch([]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    const leftBtns = dialog.querySelectorAll('sl-button[slot="footer-left"]');
    expect(leftBtns.length).to.equal(1);
    expect(leftBtns[0].textContent).to.equal('Cancel');

    leftBtns[0].click();
    await promise;
  });

  it('shows "Open folder" and resolves "folder" when folder has contents', async () => {
    mockFetch([{ path: '/org/repo/some/missing-doc/child', name: 'child' }]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    const leftBtns = dialog.querySelectorAll('sl-button[slot="footer-left"]');
    expect(leftBtns.length).to.equal(2);
    const folderBtn = [...leftBtns].find((b) => b.textContent === 'Open folder');
    expect(folderBtn).to.exist;
    folderBtn.click();

    expect(await promise).to.equal('folder');
  });

  it('calls the /list endpoint with the path stripped of .html', async () => {
    mockFetch([]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    expect(fetchCalls[0]).to.equal('https://admin.da.live/list/org/repo/some/missing-doc');

    // Clean up by cancelling.
    document.querySelector('da-dialog').querySelector('sl-button[slot="footer-left"]').click();
    await promise;
  });

  it('resolves "cancel" when the dialog is closed without a button action', async () => {
    mockFetch([]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    document.querySelector('da-dialog').close();

    expect(await promise).to.equal('cancel');
  });

  it('mentions the existing folder in the message when one exists', async () => {
    mockFetch([{ path: '/org/repo/some/missing-doc/child', name: 'child' }]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    const intro = dialog.querySelector('p');
    expect(intro.textContent).to.equal(
      'There is no document named missing-doc at this path, but there is a folder with that name.',
    );

    dialog.querySelector('sl-button[slot="footer-left"]').click();
    await promise;
  });

  it('uses the plain message when no folder exists', async () => {
    mockFetch([]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    const intro = dialog.querySelector('p');
    expect(intro.textContent).to.equal(
      'There is no document named missing-doc at this path.',
    );

    dialog.querySelector('sl-button[slot="footer-left"]').click();
    await promise;
  });

  it('closes the dialog and resolves "hashchange" on hashchange', async () => {
    mockFetch([]);
    const promise = showNotFoundDialog(details);
    await waitForDialog();
    expect(document.querySelector('da-dialog')).to.exist;

    window.dispatchEvent(new Event('hashchange'));

    expect(await promise).to.equal('hashchange');
  });

  it('resolves "hashchange" without showing the dialog if hash changes during the folder check', async () => {
    let resolveFetch;
    window.fetch = (url) => {
      fetchCalls.push(url);
      return new Promise((r) => { resolveFetch = r; });
    };

    const promise = showNotFoundDialog(details);
    // daFetch has its own async prelude (token lookup) before it reaches
    // window.fetch, so yield the event loop until our mock is actually invoked.
    await new Promise((r) => { setTimeout(r, 10); });
    expect(resolveFetch, 'fetch mock should have been called').to.be.a('function');

    // Fire hashchange while the folder-check fetch is still pending.
    window.dispatchEvent(new Event('hashchange'));
    // Let the fetch complete afterwards — dialog code must short-circuit.
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => [],
      headers: { get: () => null },
    });

    expect(await promise).to.equal('hashchange');
    expect(document.querySelector('da-dialog')).to.be.null;
  });

  it('resolves "cancel" when the folder existence check fails', async () => {
    // Non-ok response → folderHasContents returns false, no "Open folder" button.
    window.fetch = async (url) => {
      fetchCalls.push(url);
      return { ok: false, status: 500, json: async () => ({}), headers: { get: () => null } };
    };
    const promise = showNotFoundDialog(details);
    await waitForDialog();

    const dialog = document.querySelector('da-dialog');
    const leftBtns = dialog.querySelectorAll('sl-button[slot="footer-left"]');
    expect(leftBtns.length).to.equal(1);

    leftBtns[0].click();
    expect(await promise).to.equal('cancel');
  });
});
