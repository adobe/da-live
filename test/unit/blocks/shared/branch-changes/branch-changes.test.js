import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/shared/branch-changes/branch-changes.js';

const change = { path: '/page.html', itemKind: 'html', change: 'modified', defaultOnly: true };
const summary = {
  branchRevision: 3,
  defaultRevision: 7,
  baseRevision: 2,
  stale: true,
  changes: [change],
};
const detail = {
  path: change.path,
  itemKind: 'html',
  contentType: 'text/html',
  default: { state: 'present', url: 'https://evil.example' },
  branch: { state: 'present' },
  base: { state: 'absent' },
};

describe('branch changes', () => {
  let element;
  let client;
  let calls;
  beforeEach(async () => {
    calls = [];
    client = {
      changes: async (...args) => { calls.push(['changes', ...args]); return summary; },
      changesDetail: async (...args) => { calls.push(['detail', ...args]); return detail; },
      getChangeValue: async (...args) => {
        calls.push(['value', ...args]);
        return new Response('<img src=x onerror=alert(1)>', { headers: { 'Content-Type': 'text/html' } });
      },
    };
    element = document.createElement('da-branch-changes');
    element.branchId = 'work';
    element.client = client;
    document.body.append(element);
    await element.updateComplete;
  });
  afterEach(() => element.remove());

  async function open() {
    element._open = true;
    await element.refresh();
    await element.updateComplete;
  }

  it('opens the comparison out of flow and clears it when dismissed', async () => {
    const trigger = element.shadowRoot.querySelector('button[popovertarget]');
    const panel = element.shadowRoot.getElementById(trigger.getAttribute('popovertarget'));
    const { height } = element.getBoundingClientRect();
    trigger.click();
    await element.updateComplete;
    expect(panel.matches(':popover-open')).to.equal(true);
    expect(getComputedStyle(panel).position).to.equal('fixed');
    expect(element.getBoundingClientRect().height).to.equal(height);
    expect(calls[0]).to.deep.equal(['changes', 'work']);
    panel.querySelector('[aria-label="Close Changes"]').click();
    await element.updateComplete;
    expect(panel.matches(':popover-open')).to.equal(false);
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
    expect(panel.querySelector('.changes-list')).to.equal(null);
  });

  it('loads the directed comparison, classifications, stale banner and pinned escaped detail', async () => {
    await open();
    expect(element.shadowRoot.textContent).to.include('Default → Branch');
    expect(element.shadowRoot.textContent).to.include('sync required');
    const metadata = element.shadowRoot.querySelector('.file-meta');
    expect([...metadata.children].map((item) => item.textContent)).to.deep.equal(['html', 'modified', 'Default only']);
    await element.select(change);
    await element.updateComplete;
    expect(calls[1]).to.deep.equal(['detail', 'work', { path: '/page.html', branchRevision: 3, defaultRevision: 7 }]);
    expect(calls.slice(2)).to.deep.equal([
      ['value', 'work', { path: '/page.html', branchRevision: 3, defaultRevision: 7, side: 'default' }],
      ['value', 'work', { path: '/page.html', branchRevision: 3, defaultRevision: 7, side: 'branch' }],
    ]);
    expect(element.shadowRoot.querySelectorAll('pre')).to.have.length(2);
    expect(element.shadowRoot.querySelector('pre').textContent).to.equal('<img src=x onerror=alert(1)>');
    expect(element.shadowRoot.querySelector('img')).to.equal(null);
  });

  it('shows empty and failure states', async () => {
    client.changes = async () => ({ ...summary, changes: [], stale: false });
    await open();
    expect(element.shadowRoot.textContent).to.include('No changes.');
    client.changes = async () => { throw new Error('offline'); };
    await element.refresh();
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('[role="alert"]').textContent).to.include('offline');
  });

  it('loads pages only when revision pins match', async () => {
    client.changes = async (id, cursor) => (cursor ? { ...summary, changes: [{ ...change, path: '/other' }], next: null } : { ...summary, next: 'more' });
    await open();
    await element.loadMore();
    await element.updateComplete;
    expect(element.shadowRoot.querySelectorAll('li')).to.have.length(2);
    client.changes = async (id, cursor) => (cursor ? { ...summary, defaultRevision: 8 } : summary);
    element._summary = { ...summary, next: 'more' };
    await element.loadMore();
    await element.updateComplete;
    expect(element.shadowRoot.textContent).to.include('comparison was refreshed');
    expect(element.shadowRoot.querySelectorAll('li')).to.have.length(1);
  });

  it('refreshes rather than rendering values if a pin moves', async () => {
    client.getChangeValue = async () => {
      const error = new Error('moved');
      error.code = 'REVISION_CHANGED';
      throw error;
    };
    await open();
    await element.select(change);
    await element.updateComplete;
    expect(element.shadowRoot.textContent).to.include('comparison was refreshed');
    expect(element.shadowRoot.querySelector('pre')).to.equal(null);
  });

  it('renders media metadata and only safe image previews, cleaning them up', async () => {
    const media = { path: '/image', itemKind: 'media', change: 'added', defaultOnly: false };
    client.changes = async () => ({ ...summary, changes: [media] });
    client.changesDetail = async () => ({ path: media.path, itemKind: 'media', default: { state: 'absent' }, branch: { state: 'present', hash: 'sha256:abc' } });
    client.getChangeValue = async () => new Response('image', { headers: { 'Content-Type': 'image/png' } });
    await open();
    await element.select(media);
    await element.updateComplete;
    expect(element.shadowRoot.textContent).to.include('Absent');
    expect(element.shadowRoot.textContent).to.include('Size: 5 bytes · Hash: sha256:abc');
    const url = element.shadowRoot.querySelector('img').getAttribute('src');
    expect(url).to.match(/^blob:/);
    const revoke = URL.revokeObjectURL;
    const revoked = [];
    URL.revokeObjectURL = (value) => {
      revoked.push(value);
      revoke.call(URL, value);
    };
    element.clearDetail();
    URL.revokeObjectURL = revoke;
    await element.updateComplete;
    expect(revoked).to.deep.equal([url]);
    client.getChangeValue = async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } });
    await element.select(media);
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('img')).to.equal(null);
    expect(element.shadowRoot.textContent).to.include('image/svg+xml');
  });

  it('ignores late detail after a selection or branch change', async () => {
    let resolve;
    client.changesDetail = () => new Promise((r) => { resolve = r; });
    await open();
    const pending = element.select(change);
    element.branchId = 'other';
    await element.updateComplete;
    resolve(detail);
    await pending;
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('pre')).to.equal(null);
    expect(calls.filter(([kind]) => kind === 'value')).to.have.length(0);
  });

  it('ignores an earlier detail after another path is selected', async () => {
    let resolve;
    const other = { ...change, path: '/other.html', defaultOnly: false };
    client.changesDetail = async (id, pins) => {
      if (pins.path === change.path) return new Promise((r) => { resolve = r; });
      return { ...detail, path: other.path };
    };
    await open();
    const pending = element.select(change);
    await element.select(other);
    resolve(detail);
    await pending;
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('h3:last-of-type').textContent).to.equal('/other.html');
    expect(calls.filter(([kind]) => kind === 'value')).to.have.length(2);
  });

  it('shows loading and handles detail errors without displaying partial sides', async () => {
    let reject;
    client.changesDetail = () => new Promise((resolve, r) => { reject = r; });
    await open();
    const pending = element.select(change);
    await element.updateComplete;
    expect(element.shadowRoot.textContent).to.include('Loading detail');
    reject(new Error('detail failed'));
    await pending;
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('[role="alert"]').textContent).to.include('detail failed');
    expect(element.shadowRoot.querySelector('.sides')).to.equal(null);
  });
});
