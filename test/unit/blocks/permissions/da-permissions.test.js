import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/permissions/da-permissions/da-permissions.js');

const INFO_KEY = 'da-permissions-info-dismissed';

const CONFIG_BODY = {
  ':names': ['permissions'],
  ':version': 3,
  permissions: {
    total: 1,
    limit: 1,
    data: [{ path: 'CONFIG', groups: 'admin@example.com', actions: 'write' }],
  },
};

const NO_SHEET_BODY = {
  ':names': ['data'],
  data: { total: 0, limit: 0, data: [] },
};

function mockFetch({ configFor, sitesFor = () => [] }) {
  const putCalls = [];
  const pending = [];
  window.fetch = async (url, opts = {}) => {
    const href = String(url);
    if (opts.method === 'PUT') {
      putCalls.push({ url: href, opts });
      return new Promise((resolve) => { pending.push(resolve); });
    }
    const match = href.match(/\/(?:config|list)\/([^/]+)/);
    const org = match ? match[1] : null;
    if (href.includes('/list/')) {
      return new Response(JSON.stringify(sitesFor(org)), { status: 200 });
    }
    return new Response(JSON.stringify(configFor(org)), { status: 200 });
  };
  return {
    putCalls,
    resolvePut(status = 200) {
      const resolve = pending.shift();
      resolve(new Response('', { status }));
    },
  };
}

async function waitUntil(predicate, { tries = 50, intervalMs = 10 } = {}) {
  for (let i = 0; i < tries && !predicate(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  }
}

async function mount(org, site = null) {
  const el = document.createElement('da-permissions');
  el.org = org;
  el.site = site;
  document.body.append(el);
  await el.updateComplete;
  // _load() is async (fetch-backed); poll until it settles past 'loading'.
  for (let i = 0; i < 50 && el._status === 'loading'; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    // eslint-disable-next-line no-await-in-loop
    await el.updateComplete;
  }
  return el;
}

describe('da-permissions', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    localStorage.removeItem(INFO_KEY);
    window.daTestToasts = [];
  });

  afterEach(() => {
    window.fetch = savedFetch;
    document.querySelectorAll('da-permissions').forEach((el) => el.remove());
    localStorage.removeItem(INFO_KEY);
  });

  it('403 -> "You don\'t have admin access to this org."', async () => {
    window.fetch = async () => new Response('', { status: 403 });
    const el = await mount('myorg');
    expect(el.shadowRoot.textContent).to.contain("You don't have admin access to this org.");
  });

  it('no permissions sheet -> the no-sheet copy, a link to /config#/myorg/, and no table "+" buttons', async () => {
    window.fetch = async () => new Response(JSON.stringify(NO_SHEET_BODY), { status: 200 });
    const el = await mount('myorg');
    expect(el.shadowRoot.textContent).to.contain('This org has no permissions sheet yet');
    const link = el.shadowRoot.querySelector('a[href="/config#/myorg/"]');
    expect(link).to.not.equal(null);
    expect(el.shadowRoot.querySelector('da-permissions-table')).to.equal(null);
  });

  it('ok -> renders a table with slots from buildSlots, and the picker items include site names', async () => {
    window.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'site1' }, { name: 'site2' }]), { status: 200 });
      }
      return new Response(JSON.stringify(CONFIG_BODY), { status: 200 });
    };
    const el = await mount('myorg');

    const table = el.shadowRoot.querySelector('da-permissions-table');
    expect(table).to.not.equal(null);
    expect(table.slots.some((s) => s.path === 'CONFIG')).to.be.true;

    const picker = el.shadowRoot.querySelector('nx-picker');
    const labels = picker.items.filter((i) => !i.divider).map((i) => i.label);
    expect(labels).to.include('site1');
    expect(labels).to.include('site2');
  });

  it('dismissing the info note sets localStorage, and the note stays hidden on remount', async () => {
    window.fetch = async () => new Response('', { status: 403 });
    let el = await mount('myorg');

    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.not.equal(null);
    el.shadowRoot.querySelector('.permissions-info-note button').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.equal(null);
    expect(localStorage.getItem(INFO_KEY)).to.equal('true');
    el.remove();

    el = await mount('myorg');
    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.equal(null);
  });

  it('org === null -> renders an org form; submitting "myorg" sets location.hash', async () => {
    const el = await mount(null);
    const form = el.shadowRoot.querySelector('form');
    expect(form).to.not.equal(null);

    window.location.hash = '';
    const input = el.shadowRoot.querySelector('input[name="org"]');
    input.value = 'myorg';
    form.requestSubmit();
    await el.updateComplete;
    expect(window.location.hash).to.equal('#/myorg');
  });

  it('add saves one PUT, renders the new pill, closes the input, clears _busy; "+" buttons disable while pending', async () => {
    const { putCalls, resolvePut } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const table = el.shadowRoot.querySelector('da-permissions-table');
    await table.updateComplete;

    const addBtn = table.shadowRoot.querySelector('tr[data-path="CONFIG"] td:nth-child(2) .cell-add');
    addBtn.click();
    await el.updateComplete;
    await table.updateComplete;

    const input = table.shadowRoot.querySelector('.cell-add-input');
    expect(input).to.not.equal(null);
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;
    await table.updateComplete;

    expect(putCalls.length).to.equal(1);
    expect(table.shadowRoot.querySelector('.cell-add-input')).to.equal(null);
    expect(el._busy).to.equal(true);
    const addButtons = [...table.shadowRoot.querySelectorAll('.cell-add')];
    expect(addButtons.length).to.be.greaterThan(0);
    addButtons.forEach((btn) => expect(btn.disabled).to.equal(true));

    resolvePut(200);
    await waitUntil(() => el._busy === false);
    await el.updateComplete;
    await table.updateComplete;

    expect(el._busy).to.equal(false);
    const readPills = table.shadowRoot.querySelector('tr[data-path="CONFIG"] td:nth-child(2) nx-pills');
    expect(readPills.items.some((i) => i.id === 'reader@x.com')).to.equal(true);
  });

  it('add input with comma list saves both', async () => {
    const { putCalls, resolvePut } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const table = el.shadowRoot.querySelector('da-permissions-table');
    await table.updateComplete;

    const addBtn = table.shadowRoot.querySelector('tr[data-path="CONFIG"] td:nth-child(3) .cell-add');
    addBtn.click();
    await el.updateComplete;
    await table.updateComplete;

    const input = table.shadowRoot.querySelector('.cell-add-input');
    input.value = 'x@x.com, y@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    resolvePut(200);
    await el.updateComplete;

    expect(putCalls.length).to.equal(1);
    const saved = JSON.parse(putCalls[0].opts.body.get('config'));
    const rule = saved.permissions.data.find((r) => r.path === 'CONFIG' && r.actions === 'write');
    expect(rule.groups.endsWith('x@x.com, y@x.com')).to.equal(true);
  });

  it('remove opens an nx-dialog with title "Remove member" and the scope/level text; Confirm PUTs, Cancel does not', async () => {
    const SITE_CONFIG_BODY = {
      ':names': ['permissions'],
      ':version': 3,
      permissions: {
        total: 1,
        limit: 1,
        data: [{ path: '/mysite/ + **', groups: 'a@x.com', actions: 'write' }],
      },
    };
    const { putCalls, resolvePut } = mockFetch({ configFor: () => SITE_CONFIG_BODY });
    const el = await mount('myorg', 'mysite');
    const table = el.shadowRoot.querySelector('da-permissions-table');
    await table.updateComplete;

    const writePills = table.shadowRoot.querySelector('tr[data-path="/mysite/ + **"] td:nth-child(3) nx-pills');
    expect(writePills).to.not.equal(null);

    writePills.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id: 'a@x.com' }, bubbles: true }));
    await el.updateComplete;

    let dialog = el.shadowRoot.querySelector('nx-dialog');
    expect(dialog).to.not.equal(null);
    expect(dialog.getAttribute('title')).to.equal('Remove member');
    expect(el.shadowRoot.textContent).to.contain('Remove a@x.com from All site content · Write?');

    dialog.querySelector('[slot="actions"].nx-action-btn').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
    expect(putCalls.length).to.equal(0);

    writePills.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id: 'a@x.com' }, bubbles: true }));
    await el.updateComplete;
    dialog = el.shadowRoot.querySelector('nx-dialog');
    dialog.querySelector('[slot="actions"].nx-btn-primary').click();
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    expect(putCalls.length).to.equal(1);
    resolvePut(200);
    await el.updateComplete;
  });

  it('PUT 403 -> shows the read-only copy and removes the "+" buttons', async () => {
    const { putCalls, resolvePut } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const table = el.shadowRoot.querySelector('da-permissions-table');
    await table.updateComplete;

    const addBtn = table.shadowRoot.querySelector('tr[data-path="CONFIG"] td:nth-child(2) .cell-add');
    addBtn.click();
    await el.updateComplete;
    await table.updateComplete;
    const input = table.shadowRoot.querySelector('.cell-add-input');
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    resolvePut(403);
    await waitUntil(() => el._readOnly === true);
    await el.updateComplete;
    await table.updateComplete;

    expect(el.shadowRoot.textContent).to.contain('You have read-only access to this configuration.');
    expect(table.shadowRoot.querySelector('.cell-add')).to.equal(null);
  });

  it('PUT 500 -> shows an error toast', async () => {
    const { putCalls, resolvePut } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const table = el.shadowRoot.querySelector('da-permissions-table');
    await table.updateComplete;
    const addBtn = table.shadowRoot.querySelector('tr[data-path="CONFIG"] td:nth-child(2) .cell-add');
    addBtn.click();
    await el.updateComplete;
    await table.updateComplete;
    const input = table.shadowRoot.querySelector('.cell-add-input');
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    resolvePut(500);
    await waitUntil(() => window.daTestToasts.length > 0);
    await el.updateComplete;

    expect(window.daTestToasts.some((t) => t.variant === 'error')).to.equal(true);
  });

  it('save result ignored after org change', async () => {
    const OTHER_CONFIG_BODY = {
      ':names': ['permissions'],
      ':version': 3,
      permissions: {
        total: 1,
        limit: 1,
        data: [{ path: 'CONFIG', groups: 'other-admin@example.com', actions: 'write' }],
      },
    };
    const { putCalls, resolvePut } = mockFetch({ configFor: (org) => (org === 'other' ? OTHER_CONFIG_BODY : CONFIG_BODY) });
    const el = await mount('myorg');
    const table = el.shadowRoot.querySelector('da-permissions-table');
    await table.updateComplete;

    const addBtn = table.shadowRoot.querySelector('tr[data-path="CONFIG"] td:nth-child(2) .cell-add');
    addBtn.click();
    await el.updateComplete;
    await table.updateComplete;
    const input = table.shadowRoot.querySelector('.cell-add-input');
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    expect(putCalls.length).to.equal(1);

    el.org = 'other';
    await el.updateComplete;
    for (let i = 0; i < 50 && el._status === 'loading'; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 10); });
      // eslint-disable-next-line no-await-in-loop
      await el.updateComplete;
    }

    const toastCountBefore = window.daTestToasts.length;
    resolvePut(200);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    await el.updateComplete;

    expect(el._rules).to.deep.equal(OTHER_CONFIG_BODY.permissions.data);
    expect(window.daTestToasts.length).to.equal(toastCountBefore);
  });
});
