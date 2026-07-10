import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let setExtensionsBridgeContext;
let versionPreviewChange;

before(async () => {
  await import('../../../../../blocks/canvas/ew-version-preview/ew-version-preview.js');
  ({ setExtensionsBridgeContext } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
  ({ versionPreviewChange } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
});

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await nextFrame();
  }
  throw new Error('Timed out waiting for condition');
}

describe('ew-version-preview', () => {
  let el;
  let savedFetch;
  let testIndex = 0;

  beforeEach(() => {
    savedFetch = window.fetch;
    testIndex += 1;
    setExtensionsBridgeContext();
  });

  afterEach(() => {
    window.fetch = savedFetch;
    setExtensionsBridgeContext();
    if (el?.parentElement) el.remove();
    el = null;
  });

  function mockVersionSource(html) {
    window.fetch = (url) => {
      const u = String(url);
      if (u.includes('/ping')) return Promise.resolve(new Response('', { status: 200 }));
      if (u.includes('/versionsource/')) return Promise.resolve(new Response(html, { status: 200 }));
      return Promise.resolve(new Response('', { status: 404 }));
    };
  }

  function mount(props) {
    el = document.createElement('ew-version-preview');
    Object.assign(el, props);
    document.body.append(el);
    return el;
  }

  it('fetches the version and renders it read-only with its label', async () => {
    const org = `org-vp-${testIndex}`;
    const site = `site-vp-${testIndex}`;
    mockVersionSource('<body><main><div><p>Hello from version</p></div></main></body>');
    mount({
      org, site, path: '/mydoc', versionId: 'abc123', label: 'Ver 1',
    });
    await waitFor(() => !!el._versionDom);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.version-title').textContent).to.contain('Ver 1');
    expect(el.shadowRoot.querySelector('.version-dom').textContent).to.contain('Hello from version');
  });

  it('disables Restore without write permission, enables it with', async () => {
    const org = `org-vp-${testIndex}`;
    const site = `site-vp-${testIndex}`;
    mockVersionSource('<body><main><div><p>content</p></div></main></body>');
    mount({
      org, site, path: '/mydoc', versionId: 'abc123', label: 'Ver 1',
    });
    await waitFor(() => !!el._versionDom);
    await el.updateComplete;
    const restoreBtn = el.shadowRoot.querySelector('.version-action-buttons .accent');
    expect(restoreBtn.disabled).to.equal(true);

    setExtensionsBridgeContext({ permissions: ['read', 'write'] });
    el.requestUpdate();
    await el.updateComplete;
    expect(restoreBtn.disabled).to.equal(false);
  });

  it('refetches and renders fresh content when versionId changes on an already-mounted element', async () => {
    const org = `org-vp-${testIndex}`;
    const site = `site-vp-${testIndex}`;
    window.fetch = (url) => {
      const u = String(url);
      if (u.includes('/ping')) return Promise.resolve(new Response('', { status: 200 }));
      if (u.includes('/versionsource/') && u.includes('versionA')) {
        return Promise.resolve(new Response('<body><main><div><p>Content A</p></div></main></body>', { status: 200 }));
      }
      if (u.includes('/versionsource/') && u.includes('versionB')) {
        return Promise.resolve(new Response('<body><main><div><p>Content B</p></div></main></body>', { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };
    mount({
      org, site, path: '/mydoc', versionId: 'versionA', label: 'Ver A',
    });
    await waitFor(() => !!el._versionDom);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.version-dom').textContent).to.contain('Content A');

    Object.assign(el, { versionId: 'versionB', label: 'Ver B' });
    await waitFor(() => el.shadowRoot.querySelector('.version-dom')?.textContent.includes('Content B'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.version-title').textContent).to.contain('Ver B');
    expect(el.shadowRoot.querySelector('.version-dom').textContent).to.contain('Content B');
  });

  it('requests the version with a .html-suffixed path on hlx6 sites, matching how the live document is loaded', async () => {
    const org = `org-vp-hlx6-${testIndex}`;
    const site = `site-vp-hlx6-${testIndex}`;
    const requestedUrls = [];
    window.fetch = (url) => {
      const u = String(url);
      requestedUrls.push(u);
      // Advertise the hlx6 upgrade so versions.get routes through the
      // source${path}/.versions/${versionId} URL shape (which uses `path`),
      // instead of legacy DA's /versionsource/ shape (which ignores `path`).
      if (u.includes('/ping')) {
        return Promise.resolve(new Response('', {
          status: 200,
          headers: { 'x-api-upgrade-available': 'da-admin' },
        }));
      }
      if (u.includes('/.versions/')) {
        return Promise.resolve(new Response('<body><main><div><p>content</p></div></main></body>', { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };
    try {
      mount({
        org, site, path: 'mydoc', versionId: 'abc123', label: 'Ver 1',
      });
      await waitFor(() => requestedUrls.some((u) => u.includes('/.versions/')));
      const versionUrl = requestedUrls.find((u) => u.includes('/.versions/'));
      expect(versionUrl).to.contain(`/${org}/sites/${site}/source/mydoc.html/.versions/abc123`);
    } finally {
      window.localStorage.removeItem('hlx6-upgrade');
    }
  });

  it('emits versionPreviewChange(null) when Cancel is clicked', async () => {
    const org = `org-vp-${testIndex}`;
    const site = `site-vp-${testIndex}`;
    mockVersionSource('<body><main><div><p>content</p></div></main></body>');
    mount({
      org, site, path: '/mydoc', versionId: 'abc123', label: 'Ver 1',
    });
    await waitFor(() => !!el._versionDom);
    await el.updateComplete;

    let received = 'unset';
    const unsub = versionPreviewChange.subscribe((detail) => { received = detail; });
    el.shadowRoot.querySelector('.version-action-buttons button').click();
    unsub();
    expect(received).to.equal(null);
  });
});
