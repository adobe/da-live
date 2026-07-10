import { expect } from '@esm-bundle/chai';
import { setNx, getNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let hashChange;
let versionPreviewChange;

before(async () => {
  await import('../../../../../blocks/canvas/ew-version-history/ew-version-history.js');
  ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
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

describe('ew-version-history', () => {
  let el;
  let savedFetch;
  let testIndex = 0;

  beforeEach(() => {
    savedFetch = window.fetch;
    testIndex += 1;
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (el?.parentElement) el.remove();
    el = null;
  });

  function mockVersionList(json, onRequest) {
    window.fetch = (url) => {
      const u = String(url);
      onRequest?.(u);
      if (u.includes('/ping')) return Promise.resolve(new Response('', { status: 200 }));
      if (u.includes('/versionlist/')) {
        return Promise.resolve(new Response(JSON.stringify(json), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };
  }

  function mount() {
    el = document.createElement('ew-version-history');
    document.body.append(el);
    return el;
  }

  it('shows a placeholder when no page is selected', async () => {
    mount();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.placeholder')).to.exist;
  });

  it('fetches and renders versions once org/site/path are known via hashChange', async () => {
    const org = `org-vh-${testIndex}`;
    const site = `site-vh-${testIndex}`;
    mockVersionList([
      {
        timestamp: 1700000000000,
        users: [{ email: 'a@example.com' }],
        url: `/versionsource/${org}/${site}/abc123`,
        label: 'Ver 1',
      },
      { timestamp: 1699999999000, users: [{ email: 'b@example.com' }] },
    ]);
    mount();
    await el.updateComplete;
    hashChange.emit({ org, site, path: 'mydoc' });
    await waitFor(() => el._versions?.length === 2);
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.da-version-entry.is-version').length).to.equal(1);
    expect(el.shadowRoot.querySelectorAll('.da-version-entry.is-audit').length).to.equal(1);
  });

  it('emits versionPreviewChange when a version row is clicked', async () => {
    const org = `org-vh-${testIndex}`;
    const site = `site-vh-${testIndex}`;
    mockVersionList([
      {
        timestamp: 1700000000000,
        users: [{ email: 'a@example.com' }],
        url: `/versionsource/${org}/${site}/abc123`,
        label: 'Ver 1',
      },
    ]);
    mount();
    await el.updateComplete;
    hashChange.emit({ org, site, path: 'mydoc' });
    await waitFor(() => el._versions?.length === 1);
    await el.updateComplete;

    let received;
    const unsub = versionPreviewChange.subscribe((detail) => { received = detail; });
    el.shadowRoot.querySelector('.da-version-entry.is-version .da-version-btn').click();
    unsub();
    expect(received.versionId).to.equal('abc123');
    expect(received.label).to.equal('Ver 1');
  });

  it('requests the version list with a .html extension, matching how DA identifies documents', async () => {
    const org = `org-vh-${testIndex}`;
    const site = `site-vh-${testIndex}`;
    const requestedUrls = [];
    mockVersionList([], (u) => requestedUrls.push(u));
    mount();
    await el.updateComplete;
    hashChange.emit({ org, site, path: 'mydoc' });
    // hashChange replays the previous test's last-emitted value to a newly
    // subscribed element before this emit runs, so wait specifically for
    // this test's own org/site rather than the first /versionlist/ request.
    await waitFor(() => requestedUrls.some((u) => u.includes(`/versionlist/${org}/${site}/`)));
    const listUrl = requestedUrls.find((u) => u.includes(`/versionlist/${org}/${site}/`));
    expect(listUrl).to.contain(`/versionlist/${org}/${site}/mydoc.html`);
  });

  it('cancels the new-version form when Escape is pressed', async () => {
    const org = `org-vh-${testIndex}`;
    const site = `site-vh-${testIndex}`;
    mockVersionList([]);
    mount();
    await el.updateComplete;
    hashChange.emit({ org, site, path: 'mydoc' });
    await waitFor(() => el.shadowRoot.querySelector('.da-version-entry.is-now'));
    await el.updateComplete;

    el.shadowRoot.querySelector('.da-version-entry.is-now .da-version-btn').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.da-version-entry.is-new')).to.exist;

    el.shadowRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.da-version-entry.is-new')).to.not.exist;
    expect(el.shadowRoot.querySelector('.da-version-entry.is-now')).to.exist;
  });

  it('ignores Escape when the new-version form is not open', async () => {
    const org = `org-vh-${testIndex}`;
    const site = `site-vh-${testIndex}`;
    mockVersionList([]);
    mount();
    await el.updateComplete;
    hashChange.emit({ org, site, path: 'mydoc' });
    await waitFor(() => el.shadowRoot.querySelector('.da-version-entry.is-now'));

    // Should not throw or otherwise misbehave when there's nothing to cancel.
    el.shadowRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.da-version-entry.is-now')).to.exist;
  });
});
